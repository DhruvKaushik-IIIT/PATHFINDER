// Server-only: Field update (frame 15). An official posts progress on an event with a REQUIRED photo:
// SAM measures it (and blurs faces/plates) → code compares with the event's first photo and with what
// the official entered (progress.ts) → photo + official_updates row + event status/ETA/timeline →
// Road Watch for travellers on that road. Mismatches are flagged on the timeline, not hidden.
import { transcribe } from "../ai/router.ts";
import { debrisVolumeM3 } from "../clearing/estimate.ts";
import { insert, publicUrl, select, update, upload } from "../db/supabase.ts";
import { eventTitle, type EventStatus } from "../events/types.ts";
import { clock } from "../geo/format.ts";
import { preparePhoto, processPhoto, type PreparedPhoto, type ProcessedPhoto } from "../reports/processPhoto.ts";
import type { Official } from "./auth.ts";
import { kmBetween } from "./districts.ts";
import { FIELD_STATUS, metricsOf, progressCheck, type FieldStatus, type PhotoMetrics, type ProgressCheck } from "./progress.ts";

// SAM results by photo hash, so "check" then "post" of the same photo runs SAM once (~$0.02).
const TTL_MS = 15 * 60_000;
const processed = new Map<string, { at: number; p: ProcessedPhoto }>();

async function analyse(prep: PreparedPhoto): Promise<ProcessedPhoto> {
  const hit = processed.get(prep.sha256);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = await processPhoto(prep);
  if (processed.size > 50) processed.delete(processed.keys().next().value!);
  processed.set(prep.sha256, { at: Date.now(), p });
  return p;
}

interface EventRow {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  confidence: number;
  passable: { bike: boolean | null; car: boolean | null; bus: boolean | null } | null;
  measurements: Record<string, unknown> | null;
  sources: { reports?: number; official?: number; news?: number; notices?: number } | null;
}

export class FieldError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function loadEvent(official: Official, eventId: string): Promise<EventRow> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new FieldError("invalid event id");
  const [row] = await select<EventRow>(
    "events",
    `select=id,type,status,place_name,lat,lng,confidence,passable,measurements,sources&id=eq.${eventId}&resolved_at=is.null&limit=1`,
  );
  if (!row || kmBetween(row, official.district) > official.district.radiusKm) throw new FieldError("Event not found in your district (or already cleared).", 404);
  return row;
}

/** The event's earliest measured photo = the baseline progress is measured against. */
async function baseline(eventId: string): Promise<(PhotoMetrics & { at: string }) | null> {
  const rows = await select<{ created_at: string; measurements: Parameters<typeof metricsOf>[0] }>(
    "photos",
    `select=created_at,measurements&event_id=eq.${eventId}&measurements=not.is.null&order=created_at.asc&limit=1`,
  );
  const m = rows[0] ? metricsOf(rows[0].measurements) : null;
  return m && (m.blockedPct !== null || m.debrisImagePct !== null) ? { ...m, at: rows[0]!.created_at } : null;
}

async function prepare(raw: Buffer): Promise<PreparedPhoto> {
  const prep = await preparePhoto(raw).catch(() => {
    throw new FieldError("That file isn't a photo we can read.");
  });
  const [dup] = await select<{ id: string }>("photos", `select=id&sha256=eq.${prep.sha256}&limit=1`);
  if (dup) throw new FieldError("This photo was already posted. Take a new photo of the site now.", 409);
  return prep;
}

export interface PhotoCheck {
  now: PhotoMetrics | null;
  before: (PhotoMetrics & { at: string }) | null;
  facesBlurred: boolean;
}

/** Step 1 (on photo pick): measure the photo and return what the browser needs for the live AI check. */
export async function checkFieldPhoto(official: Official, eventId: string, raw: Buffer): Promise<PhotoCheck> {
  const ev = await loadEvent(official, eventId);
  const p = await analyse(await prepare(raw));
  return { now: p.degraded.includes("AI measurement unavailable right now") ? null : metricsOf(p.measurements), before: await baseline(ev.id), facesBlurred: p.facesBlurred };
}

export interface FieldInput {
  eventId: string;
  photo: Buffer;
  status: FieldStatus;
  pctCleared: number;
  /** "HH:MM" IST — the next time it's that clock time. */
  fullyOpenBy: string | null;
  machines: string;
  voiceWav: Buffer | null;
}

export interface FieldResult {
  updateId: string;
  eventId: string;
  eventStatus: EventStatus;
  resolved: boolean;
  check: ProgressCheck;
  transcript: string | null;
  /** Where Road Watch should look (the route handler runs it after responding). */
  point: { lat: number; lng: number };
}

/** "14:00" → next 14:00 in IST (today, or tomorrow if that's past). */
export function nextIstTime(hhmm: string, now = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const IST = 5.5 * 3_600_000;
  const local = new Date(now.getTime() + IST);
  const t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(m[1]), Number(m[2])) - IST;
  return new Date(t > now.getTime() ? t : t + 24 * 3_600_000);
}

export async function postFieldUpdate(official: Official, input: FieldInput): Promise<FieldResult> {
  const ev = await loadEvent(official, input.eventId);
  const prep = await prepare(input.photo);
  const [p, before, voice, crewRows] = await Promise.all([
    analyse(prep),
    baseline(ev.id),
    input.voiceWav ? transcribe(input.voiceWav) : null,
    select<{ id: string; name: string }>("crews", `select=id,name&current_event_id=eq.${ev.id}&limit=1`),
  ]);
  const samOk = !p.degraded.includes("AI measurement unavailable right now");
  const check = progressCheck({ now: samOk ? metricsOf(p.measurements) : null, before, claimedPct: input.pctCleared, status: input.status });
  const transcript = voice?.data?.text ?? null;
  const now = new Date();
  const eta = input.status === "open" ? null : input.fullyOpenBy ? nextIstTime(input.fullyOpenBy, now) : null;
  const newStatus = FIELD_STATUS[input.status].event;
  const resolved = input.status === "open";
  const crew = crewRows[0] ?? null;
  const machines = input.machines.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);

  // ---- photo (private original, blurred public copy) — same buckets as traveller reports
  const [photoRow] = await insert<{ id: string }>("photos", {
    event_id: ev.id,
    sha256: p.sha256,
    original_url: null,
    width: p.width,
    height: p.height,
    sam_masks: p.sam,
    measurements: samOk ? p.measurements : null,
    faces_blurred: p.facesBlurred,
    source: "official",
    is_demo: official.isDemo,
  });
  const pid = photoRow!.id;
  const pubPath = `official/${pid}${p.facesBlurred ? "" : "-thumb"}.jpg`;
  await Promise.all([
    upload("photos-original", `official/${pid}.jpg`, p.original, "image/jpeg"),
    upload("photos-public", pubPath, p.public, "image/jpeg"),
    input.voiceWav ? upload("photos-original", `voice/official-${pid}.wav`, input.voiceWav, "audio/wav") : null,
  ]);
  await update("photos", `id=eq.${pid}`, { original_url: `photos-original/official/${pid}.jpg`, public_url: publicUrl("photos-public", pubPath) });

  // ---- the update itself
  const aiCheck = { level: check.level, text: check.text, photoDropPct: check.photoDropPct, facesBlurred: p.facesBlurred };
  const [upd] = await insert<{ id: string }>("official_updates", {
    event_id: ev.id,
    user_id: official.userId,
    status: newStatus,
    pct_cleared: input.pctCleared,
    eta_full_open: eta?.toISOString() ?? null,
    machines,
    photo_id: pid,
    ai_check: { ...aiCheck, transcript, crew: crew?.name ?? null, org: official.org },
    is_demo: official.isDemo,
  });

  // ---- world state: officials carry more trust, but only a photo-consistent update raises confidence
  const sources = { reports: 0, official: 0, news: 0, notices: 0, ...ev.sources };
  const title = eventTitle(ev.type, ev.place_name);
  const etaText = eta ? `fully open by ~${clock(eta.toISOString())}` : null;
  const passable =
    newStatus === "open"
      ? { bike: true, car: true, bus: true }
      : newStatus === "one_lane"
        ? { bike: true, car: true, bus: ev.passable?.bus ?? false }
        : { bike: false, car: false, bus: false };
  const stateEn = { closed: "closed while crews clear it", one_lane: "one lane open", open: "fully open again" }[newStatus];
  const stateHi = { closed: "सफ़ाई के दौरान बंद", one_lane: "एक लेन खुली", open: "पूरी तरह खुल गया" }[newStatus];
  const measured = samOk ? Object.fromEntries(Object.entries(p.measurements).filter(([k]) => ["blockedPct", "roadWidthLeftM", "roadTotalWidthM", "blockedLengthM"].includes(k))) : {};
  await update("events", `id=eq.${ev.id}`, {
    status: newStatus,
    passable,
    eta_clear: eta ? { earliest: new Date(Math.max(now.getTime(), eta.getTime() - 90 * 60_000)).toISOString(), latest: eta.toISOString() } : null,
    measurements: (() => {
      const merged = { ...(ev.measurements ?? {}), ...measured };
      return { ...merged, debrisVolumeM3: debrisVolumeM3(ev.type, merged) };
    })(),
    summary: `${title}: ${stateEn}${resolved ? "" : `, ${input.pctCleared}% cleared`}${etaText ? `, ${etaText}` : ""} (${official.org} update).`,
    summary_hi: `${title}: ${stateHi}${resolved ? "" : `, ${input.pctCleared}% साफ़`}${eta ? `, ~${clock(eta.toISOString())} तक पूरी तरह खुलने की उम्मीद` : ""} (${official.org})।`,
    confidence: check.level === "ok" ? Math.max(ev.confidence, 0.9) : ev.confidence,
    last_confirmed_at: now.toISOString(),
    sources: { ...sources, official: sources.official + 1 },
    ...(resolved && { resolved_at: now.toISOString() }),
  });
  if (resolved && crew) await update("crews", `id=eq.${crew.id}`, { current_event_id: null, available: true });

  const parts = [
    resolved ? "Fully open" : `${input.pctCleared}% cleared · ${FIELD_STATUS[input.status].label.toLowerCase()}`,
    etaText,
    machines.length ? machines.join(", ") : null,
  ].filter(Boolean);
  const flag = check.level === "warn" ? " · ⚠ photo doesn't match — flagged" : check.level === "unknown" ? " · photo not checked" : " · photo matches";
  await insert("event_timeline", {
    event_id: ev.id,
    at: now.toISOString(),
    kind: "official",
    text: `Field update: ${parts.join(" · ")}${flag}${transcript ? ` · note: “${transcript.slice(0, 200)}”` : ""}`,
    actor: crew ? `${official.org} · ${crew.name}` : official.org,
    data: { updateId: upd!.id, photoId: pid, aiCheck: check.level },
    is_demo: official.isDemo,
  });

  return { updateId: upd!.id, eventId: ev.id, eventStatus: newStatus, resolved, check, transcript, point: { lat: ev.lat, lng: ev.lng } };
}
