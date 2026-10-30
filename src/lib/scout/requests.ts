// Server-only: Scout requests (CLAUDE.md 6.2 rule 6, Phase 5). Plain code, no AI.
// A request = "we need a fresh photo of this road segment". It comes from the Investigator
// (request_scout_photo) or from the data-gap scan (demand × gap: watched trips through an event
// whose evidence is old). It is sent as an alert to opted-in scouts who are nearby AND stationary:
// coarse location (~1 km) fresh in the last 30 min, speed ≤ 10 km/h, at most 2 requests a day each,
// and every message says "only when safely stopped". Answering (a photo via /report?scout=…) fulfils it.
import { insert, select, update } from "../db/supabase.ts";
import { eventTitle } from "../events/types.ts";
import { watchers } from "../watch/watchers.ts";
import { kmBetween } from "../official/districts.ts";

export const SCOUT_RADIUS_KM = 15;
export const MAX_SPEED_KMH = 10;
export const MAX_PER_DAY = 2;
const LOCATION_FRESH_MIN = 30;
const REQUEST_TTL_H = 12;
const MAX_RECIPIENTS = 4; // per request, over its lifetime
export const SCOUT_BONUS = 15;
const GAP_H = { fast: 3, slow: 6 };
const FAST_TYPES = new Set(["snow", "ice", "traffic", "accident", "flood_water"]);

export interface ScoutRequest {
  id: string;
  segment_id: string | null;
  question: string;
  demand_count: number;
  sent_to: string[];
  fulfilled_by_report_id: string | null;
  created_at: string;
  is_demo: boolean;
  /** Phase 6B: a request for a newer photo of a slope site (instead of the road event on the segment). */
  slope_site_id?: string | null;
}

interface Target {
  id: string;
  type: string;
  status: string;
  place_name: string | null;
  lat: number;
  lng: number;
  last_confirmed_at: string;
  slope?: boolean;
}

const COLS = "id,segment_id,question,demand_count,sent_to,fulfilled_by_report_id,created_at,is_demo,slope_site_id";
const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

/** One open request per segment: asking again raises its demand instead of adding a row. */
export async function ensureRequest(segmentId: string, question: string, opts: { demand?: number; isDemo?: boolean } = {}): Promise<ScoutRequest> {
  const since = new Date(Date.now() - REQUEST_TTL_H * 3_600_000).toISOString();
  const [open] = await select<ScoutRequest>(
    "scout_requests",
    `select=${COLS}&segment_id=eq.${encodeURIComponent(segmentId)}&slope_site_id=is.null&fulfilled_by_report_id=is.null&created_at=gte.${since}&order=created_at.desc&limit=1`,
  );
  const demand = opts.demand ?? 1;
  if (open) {
    const next = Math.max(open.demand_count + (opts.demand === undefined ? 1 : 0), demand);
    if (next !== open.demand_count) await update("scout_requests", `id=eq.${open.id}`, { demand_count: next });
    return { ...open, demand_count: next };
  }
  const [row] = await insert<ScoutRequest>("scout_requests", { segment_id: segmentId, question: question.slice(0, 160), demand_count: demand, is_demo: opts.isDemo ?? false });
  return row!;
}

/** One open request per slope site (Phase 6B): rain is coming and nobody has photographed the slope lately. */
export async function ensureSlopeRequest(site: { id: string; segment_id: string | null; is_demo?: boolean }, question: string): Promise<ScoutRequest> {
  const since = new Date(Date.now() - REQUEST_TTL_H * 3_600_000).toISOString();
  const [open] = await select<ScoutRequest>(
    "scout_requests",
    `select=${COLS}&slope_site_id=eq.${site.id}&fulfilled_by_report_id=is.null&created_at=gte.${since}&order=created_at.desc&limit=1`,
  );
  if (open) return open;
  const [row] = await insert<ScoutRequest>("scout_requests", {
    segment_id: site.segment_id, slope_site_id: site.id, question: question.slice(0, 160), demand_count: 1, is_demo: site.is_demo ?? false,
  });
  return row!;
}

/** The open event a request is about (requests are per segment), or the slope site. null → nothing left to photograph. */
async function targetOf(req: ScoutRequest): Promise<Target | null> {
  if (req.slope_site_id) {
    const [site] = await select<{ id: string; place_name: string | null; lat: number; lng: number; last_observed_at: string | null; created_at: string; risk_level: string }>(
      "slope_sites",
      `select=id,place_name,lat,lng,last_observed_at,created_at,risk_level&id=eq.${req.slope_site_id}`,
    );
    return site ? { id: site.id, type: "slope", status: site.risk_level, place_name: site.place_name, lat: site.lat, lng: site.lng, last_confirmed_at: site.last_observed_at ?? site.created_at, slope: true } : null;
  }
  if (!req.segment_id) return null;
  const [ev] = await select<Target>(
    "events",
    `select=id,type,status,place_name,lat,lng,last_confirmed_at&segment_id=eq.${encodeURIComponent(req.segment_id)}&resolved_at=is.null&order=last_confirmed_at.desc&limit=1`,
  );
  return ev ?? null;
}

interface ScoutUser {
  id: string;
  coarse_lat: number;
  coarse_lng: number;
  speed_kmh: number | null;
}

/** Opted-in scouts with a fresh coarse location inside the box around a point. Speed is checked by the caller. */
async function scoutsNear(p: { lat: number; lng: number }): Promise<ScoutUser[]> {
  const since = new Date(Date.now() - LOCATION_FRESH_MIN * 60_000).toISOString();
  const d = SCOUT_RADIUS_KM / 111;
  const dl = SCOUT_RADIUS_KM / (111 * Math.cos((p.lat * Math.PI) / 180));
  return select<ScoutUser>(
    "users",
    `select=id,coarse_lat,coarse_lng,speed_kmh&scout_opt_in=is.true&location_mode=neq.off&coarse_updated_at=gte.${since}` +
      `&coarse_lat=gte.${p.lat - d}&coarse_lat=lte.${p.lat + d}&coarse_lng=gte.${p.lng - dl}&coarse_lng=lte.${p.lng + dl}&limit=200`,
  );
}

async function sentToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const rows = await select<{ id: string }>("alerts", `select=id&user_id=eq.${userId}&kind=eq.scout_request&created_at=gte.${since}&limit=${MAX_PER_DAY}`);
  return rows.length;
}

/** Safety (6.2 rule 6): never someone moving faster than 10 km/h. Unknown speed (desktop, no GPS speed) is allowed. */
export const isStationary = (speed: number | null | undefined) => speed == null || speed <= MAX_SPEED_KMH;

async function sendTo(req: ScoutRequest, ev: Target, user: ScoutUser): Promise<void> {
  const km = Math.max(1, Math.round(kmBetween({ lat: user.coarse_lat, lng: user.coarse_lng }, ev)));
  const n = (await watchers(ev)).userIds.filter((id) => id !== user.id).length;
  if (ev.slope) {
    // Phase 6B: a newer photo of the hillside above the road.
    await insert("alerts", {
      user_id: user.id,
      kind: "scout_request",
      title: "Can you photograph a slope?",
      body: `${req.question} You're ~${km} km away. Only when safely stopped, and never stand under the slope.`,
      data: { requestId: req.id, slopeSiteId: ev.id, title: `Slope near ${ev.place_name ?? "the road"}`, question: req.question, lat: ev.lat, lng: ev.lng, km, url: `/report?mode=slope&site=${ev.id}&scout=${req.id}` },
    });
    req.sent_to = [...req.sent_to, user.id];
    await update("scout_requests", `id=eq.${req.id}`, { sent_to: req.sent_to });
    return;
  }
  const h = Math.round(hoursSince(ev.last_confirmed_at));
  const place = ev.place_name ?? "a road near you";
  const who = n > 0 ? `${n} ${n === 1 ? "traveller is" : "travellers are"} watching trips through ${place}` : `Travellers need fresh info on ${place}`;
  await insert("alerts", {
    user_id: user.id,
    kind: "scout_request",
    title: "Can you help travellers?",
    body: `${who} — last photo ${h < 1 ? "under an hour" : `${h} h`} ago. You're ~${km} km away. Share a quick photo, only when safely stopped.`,
    data: {
      requestId: req.id,
      eventId: ev.id,
      title: eventTitle(ev.type, ev.place_name),
      question: req.question,
      lat: ev.lat,
      lng: ev.lng,
      km,
      url: `/report?scout=${req.id}`,
    },
  });
  req.sent_to = [...req.sent_to, user.id];
  await update("scout_requests", `id=eq.${req.id}`, { sent_to: req.sent_to });
}

export interface DispatchResult {
  requestId: string;
  sent: number;
  skipped?: string;
}

/** Send one request to up to the remaining recipients, nearest first. */
export async function dispatchRequest(req: ScoutRequest): Promise<DispatchResult> {
  if (req.fulfilled_by_report_id) return { requestId: req.id, sent: 0, skipped: "already answered" };
  if (hoursSince(req.created_at) > REQUEST_TTL_H) return { requestId: req.id, sent: 0, skipped: "expired" };
  const room = MAX_RECIPIENTS - req.sent_to.length;
  if (room <= 0) return { requestId: req.id, sent: 0, skipped: "enough scouts asked" };
  const ev = await targetOf(req);
  if (!ev) return { requestId: req.id, sent: 0, skipped: "no open event on this segment" };
  const candidates = (await scoutsNear(ev))
    .filter((u) => !req.sent_to.includes(u.id) && isStationary(u.speed_kmh))
    .map((u) => ({ u, km: kmBetween({ lat: u.coarse_lat, lng: u.coarse_lng }, ev) }))
    .filter((x) => x.km <= SCOUT_RADIUS_KM)
    .sort((a, b) => a.km - b.km);
  let sent = 0;
  for (const { u } of candidates) {
    if (sent >= room) break;
    if ((await sentToday(u.id)) >= MAX_PER_DAY) continue;
    await sendTo(req, ev, u);
    sent++;
  }
  return { requestId: req.id, sent, ...(sent === 0 && { skipped: candidates.length ? "nearby scouts reached today's limit" : "no stationary scouts nearby" }) };
}

export async function openRequests(): Promise<ScoutRequest[]> {
  const since = new Date(Date.now() - REQUEST_TTL_H * 3_600_000).toISOString();
  return select<ScoutRequest>("scout_requests", `select=${COLS}&fulfilled_by_report_id=is.null&created_at=gte.${since}&order=demand_count.desc&limit=50`);
}

/** Pull path: a scout just shared a (stationary) location → is there a request near them? At most one per ping. */
export async function dispatchForUser(user: ScoutUser): Promise<string | null> {
  if (!isStationary(user.speed_kmh) || (await sentToday(user.id)) >= MAX_PER_DAY) return null;
  for (const req of await openRequests()) {
    if (req.sent_to.includes(user.id) || req.sent_to.length >= MAX_RECIPIENTS) continue;
    const ev = await targetOf(req);
    if (!ev || kmBetween({ lat: user.coarse_lat, lng: user.coarse_lng }, ev) > SCOUT_RADIUS_KM) continue;
    await sendTo(req, ev, user);
    return req.id;
  }
  return null;
}

export interface GapResult {
  eventId: string;
  place: string | null;
  hoursOld: number;
  watchers: number;
  score: number;
  requestId: string;
}

/**
 * Data-gap scan (cron): open events with old evidence, scored demand × gap
 * (1 + travellers watching a trip through it) × hours since last confirmed. Top N get a request.
 */
export async function scanGaps(limit = 5): Promise<GapResult[]> {
  const rows = await select<Target & { segment_id: string | null; is_demo: boolean }>(
    "events",
    "select=id,segment_id,type,status,place_name,lat,lng,last_confirmed_at,is_demo&resolved_at=is.null&segment_id=not.is.null&status=neq.open&type=not.in.(clear,closure_notice)&limit=300",
  );
  const gaps = rows.filter((e) => hoursSince(e.last_confirmed_at) > (FAST_TYPES.has(e.type) ? GAP_H.fast : GAP_H.slow));
  const scored = await Promise.all(
    gaps.map(async (e) => {
      const w = (await watchers(e)).userIds.length;
      return { e, w, h: hoursSince(e.last_confirmed_at), score: Math.round((1 + w) * hoursSince(e.last_confirmed_at) * 10) / 10 };
    }),
  );
  const out: GapResult[] = [];
  for (const { e, w, h, score } of scored.sort((a, b) => b.score - a.score).slice(0, limit)) {
    const req = await ensureRequest(e.segment_id!, `What does the road look like at ${e.place_name ?? "this spot"} right now?`, { demand: 1 + w, isDemo: e.is_demo });
    out.push({ eventId: e.id, place: e.place_name, hoursOld: Math.round(h), watchers: w, score, requestId: req.id });
  }
  return out;
}

/** A report answered the request → fulfilled; returns the scout bonus (0 if someone answered first). */
export async function fulfilScoutRequest(requestId: string, reportId: string): Promise<number> {
  const [req] = await select<ScoutRequest>("scout_requests", `select=${COLS}&id=eq.${requestId}&limit=1`);
  if (!req || req.fulfilled_by_report_id) return 0;
  await update("scout_requests", `id=eq.${requestId}`, { fulfilled_by_report_id: reportId });
  return SCOUT_BONUS;
}
