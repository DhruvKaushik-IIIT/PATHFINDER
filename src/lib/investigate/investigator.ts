// Server-only: the Investigator (CLAUDE.md 6.1 VERIFY, Phase 5). When an event is doubtful (low
// confidence, stale, past its clearing time, news-only) the agent gathers evidence and explains it.
// Code decides what that changes: confidence moves at most ±0.15 per run, the STATUS never changes
// (only new evidence — a photo, an official update, a news item — does that), a suspected change is
// flagged on the timeline and turned into a scout photo request.
import { groundedSearch, investigate } from "../ai/router.ts";
import { ist } from "../ai/tools/routeCheck.ts";
import { runInvestigateTool, type InvestigatedEvent, type InvestigateContext } from "../ai/tools/investigate.ts";
import { insert, select, update } from "../db/supabase.ts";
import { dispatchRequest, type ScoutRequest } from "../scout/requests.ts";
import { eventTitle, type InvestigationSummary } from "../events/types.ts";

const STALE_H = { fast: 4, slow: 8 }; // snow/ice/traffic change by the hour; slides and damage slower
const FAST_TYPES = new Set(["snow", "ice", "traffic", "accident", "flood_water"]);
const RECHECK_H = 3; // one investigation per event per 3 h unless new evidence arrived
const MAX_STEP = 0.15;
const NEWS_ONLY_CAP = 0.65;
export const INVESTIGATOR_ACTOR = "Investigator";

const EVENT_COLS =
  "id,segment_id,type,status,place_name,lat,lng,summary,confidence,started_at,last_confirmed_at,eta_clear,measurements,sources,is_demo,road_segments(road_ref,road_name)";

const hoursSince = (iso: string, now: number) => (now - new Date(iso).getTime()) / 3_600_000;
const newsOnly = (ev: InvestigatedEvent) => !ev.sources?.reports && !ev.sources?.official && Boolean(ev.sources?.news);

/** Why this event needs a second look, in plain words — or null if it doesn't. */
export function whyInvestigate(ev: InvestigatedEvent, now = Date.now()): string | null {
  if (ev.status === "open" || ev.type === "clear" || ev.type === "closure_notice") return null; // notices are official, long-lived
  const reasons: string[] = [];
  if (ev.confidence < 0.6) reasons.push(`confidence only ${Math.round(ev.confidence * 100)}%`);
  if (newsOnly(ev)) reasons.push("only from news, no photo yet");
  const age = hoursSince(ev.last_confirmed_at, now);
  if (age > (FAST_TYPES.has(ev.type) ? STALE_H.fast : STALE_H.slow)) reasons.push(`last confirmed ${Math.round(age)} h ago`);
  if (ev.eta_clear && now > new Date(ev.eta_clear.latest).getTime()) reasons.push(`expected to clear by ${ist(ev.eta_clear.latest).slice(11, 16)} IST but still marked ${ev.status.replace("_", " ")}`);
  return reasons.length ? reasons.join("; ") : null;
}

/** Stored in the timeline item's data; same shape the event page reads. */
export type InvestigationNote = InvestigationSummary;

/** Latest investigation on the event's timeline, if any. */
export async function lastInvestigation(eventId: string): Promise<InvestigationNote | null> {
  const [row] = await select<{ at: string; data: InvestigationNote | null }>(
    "event_timeline",
    `select=at,data&event_id=eq.${eventId}&kind=eq.ai&actor=like.${INVESTIGATOR_ACTOR}*&order=at.desc&limit=1`,
  );
  return row?.data ? { ...row.data, at: row.at } : null;
}

export interface InvestigateResult {
  eventId: string;
  ran: boolean;
  /** Why nothing ran: not doubtful, or checked recently. */
  skipped?: string;
  reason: string | null;
  note: InvestigationNote | null;
  trace: string[];
  degraded?: string;
}

async function loadEvent(id: string): Promise<InvestigatedEvent | null> {
  const [ev] = await select<InvestigatedEvent>("events", `select=${EVENT_COLS}&id=eq.${id}&resolved_at=is.null&limit=1`);
  return ev ?? null;
}

const PROVIDER_NAME: Record<string, string> = { baseten: "Muse Spark Open", meta: "Muse Spark", code: "rules", mock: "mock" };

export async function investigateEvent(id: string, opts: { force?: boolean } = {}): Promise<InvestigateResult> {
  const ev = await loadEvent(id);
  if (!ev) return { eventId: id, ran: false, skipped: "event not found or already cleared", reason: null, note: null, trace: [] };
  const now = Date.now();
  const reason = whyInvestigate(ev, now) ?? (opts.force ? "manual re-check" : null);
  const prev = await lastInvestigation(id);
  if (!reason) return { eventId: id, ran: false, skipped: "evidence is fresh and consistent", reason: null, note: prev, trace: [] };
  // Cache: nothing new since the last check → same answer, no AI.
  if (!opts.force && prev && hoursSince(prev.at, now) < RECHECK_H && ev.last_confirmed_at <= prev.at) {
    return { eventId: id, ran: false, skipped: `checked ${Math.round(hoursSince(prev.at, now) * 60)} min ago, nothing new since`, reason, note: prev, trace: [] };
  }

  const place = ev.place_name ?? "this spot";
  const ctx: InvestigateContext = {
    event: ev,
    searchesLeft: 1,
    scoutRequestId: null,
    citedUrls: new Set(),
    search: async (query) => {
      const r = await groundedSearch(
        `Today is ${ist(new Date())} (IST). Search recent news (last 72 hours only) for: ${query} (Himachal Pradesh, India). ` +
          `Report only what the articles say about this road's current state (closed / one lane / reopened, work in progress), each with its publication date and URL. ` +
          `If nothing recent, say "No recent reports". Be brief.`,
        "investigate_search",
        "low",
      );
      return r.data ? { text: r.data.text, sources: r.data.sources } : null;
    },
  };
  const res = await investigate(ctx, reason);
  const f = res.data.findings;

  // ---- code decides what changes
  let after = ev.confidence;
  if (f) {
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, f.confidence - ev.confidence));
    after = Math.max(0.15, ev.confidence + step);
    if (newsOnly(ev)) after = Math.min(after, NEWS_ONLY_CAP);
    after = Math.round(after * 1000) / 1000;
  }
  const suspectsChange = f && (f.finding === "likely_changed" || f.finding === "likely_cleared" || f.finding === "conflicting");
  if (suspectsChange && !ctx.scoutRequestId && ev.segment_id) {
    await runInvestigateTool(ctx, "request_scout_photo", JSON.stringify({ question: f.scoutQuestion ?? `What does the road look like at ${place} right now?` }));
  }

  const note: InvestigationNote = f
    ? {
        at: new Date().toISOString(),
        finding: f.finding,
        suggestedStatus: suspectsChange ? f.suggestedStatus : null,
        explanation: f.explanation,
        explanationHi: f.explanationHi,
        evidence: f.evidence,
        by: res.data.by,
        scoutRequested: Boolean(ctx.scoutRequestId),
        confidenceBefore: ev.confidence,
        confidenceAfter: after,
      }
    : {
        at: new Date().toISOString(),
        finding: "unavailable",
        suggestedStatus: null,
        explanation: `AI check unavailable right now. ${reason[0]!.toUpperCase()}${reason.slice(1)} — treat with care and verify with official sources.`,
        explanationHi: null,
        evidence: [],
        by: res.data.by,
        scoutRequested: false,
        confidenceBefore: ev.confidence,
        confidenceAfter: ev.confidence,
      };

  const flag = suspectsChange ? (f.finding === "likely_cleared" ? " ⚠ may have cleared — needs a fresh photo" : f.finding === "conflicting" ? " ⚠ sources disagree" : " ⚠ may have changed — needs a fresh photo") : "";
  await insert("event_timeline", {
    event_id: ev.id,
    kind: "ai",
    actor: `${INVESTIGATOR_ACTOR} · ${PROVIDER_NAME[res.data.by] ?? res.data.by}`,
    text: `AI check: ${note.explanation}${flag}`,
    data: { ...note, reason, trace: res.data.trace, title: eventTitle(ev.type, ev.place_name) },
    is_demo: ev.is_demo ?? false,
  });
  if (after !== ev.confidence) await update("events", `id=eq.${ev.id}`, { confidence: after });
  if (ctx.scoutRequestId) {
    const [req] = await select<ScoutRequest>("scout_requests", `select=id,segment_id,question,demand_count,sent_to,fulfilled_by_report_id,created_at,is_demo&id=eq.${ctx.scoutRequestId}`);
    if (req) await dispatchRequest(req).catch((err: Error) => console.warn("[investigate] scout dispatch failed:", err.message));
  }

  return { eventId: id, ran: true, reason, note, trace: res.data.trace, ...(res.degraded && { degraded: res.degraded }) };
}

/** Cron sweep: the most doubtful open events first, a few per run (each run costs ~1 Spark agent + ≤1 search). */
export async function sweepInvestigations(limit = 6): Promise<InvestigateResult[]> {
  const rows = await select<InvestigatedEvent>("events", `select=${EVENT_COLS}&resolved_at=is.null&order=last_confirmed_at.asc&limit=200`);
  const now = Date.now();
  const doubtful = rows
    .map((ev) => ({ ev, reason: whyInvestigate(ev, now) }))
    .filter((x) => x.reason)
    .sort((a, b) => a.ev.confidence - b.ev.confidence)
    .slice(0, limit);
  const out: InvestigateResult[] = [];
  for (const { ev } of doubtful) out.push(await investigateEvent(ev.id)); // sequential: keeps rate + spend predictable
  return out;
}
