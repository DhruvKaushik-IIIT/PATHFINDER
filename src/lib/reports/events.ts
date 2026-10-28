// Server-only: Verifier v1 world-state update (CLAUDE.md 6.1 VERIFY → WORLD STATE).
// A verified claim either merges into the open event on the same segment (seen in the last
// 24 h) or creates a new one. Every change adds a timeline item. Latest verified evidence wins
// for status (roads change by the hour); confidence grows with independent confirmations.
import type { Claim, Verdict } from "../ai/schemas.ts";
import { debrisVolumeM3, type Range } from "../clearing/estimate.ts";
import { insert, select, update } from "../db/supabase.ts";

const MERGE_WINDOW_H = 24;
const NEAR_DEG = 0.003; // ~300 m box when the report could not be snapped to a segment

export interface EventRow {
  id: string;
  segment_id: string | null;
  type: string;
  status: string;
  confidence: number;
  sources: { reports: number; official: number; news: number; notices: number };
  models_agreed: number | null;
}

export interface EventUpdate {
  claim: Claim;
  verdict: Verdict;
  verifiedBy: string;
  modelsAgreed: number;
  segmentId: string | null;
  placeName: string | null;
  lat: number;
  lng: number;
  reportId: string;
  photoUrl: string | null;
  /** SAM's own numbers for the photo (road width, etc.), merged under the claim's. */
  sam?: { roadTotalWidthM?: Range; blockedLengthM?: Range; blockedPct?: Range } | null;
}

export interface EventResult {
  eventId: string | null;
  action: "created" | "merged" | "noted" | "none";
  reportStatus: "accepted" | "pending" | "rejected";
  /** Reports on the event including this one (0 when no event). */
  eventReports: number;
}

async function findOpenEvent(u: EventUpdate): Promise<EventRow | null> {
  const since = new Date(Date.now() - MERGE_WINDOW_H * 3_600_000).toISOString();
  const cols = "id,segment_id,type,status,confidence,sources,models_agreed";
  const where = u.segmentId
    ? `segment_id=eq.${encodeURIComponent(u.segmentId)}`
    : `lat=gte.${u.lat - NEAR_DEG}&lat=lte.${u.lat + NEAR_DEG}&lng=gte.${u.lng - NEAR_DEG}&lng=lte.${u.lng + NEAR_DEG}`;
  const [row] = await select<EventRow>(
    "events",
    `select=${cols}&${where}&resolved_at=is.null&last_confirmed_at=gte.${since}&order=last_confirmed_at.desc&limit=1`,
  );
  return row ?? null;
}

/** Combined confidence of one verified report: both models' views, a bonus when they agree. */
function reportConfidence(u: EventUpdate): number {
  const base = (u.claim.confidence + u.verdict.confidence) / 2;
  return Math.min(0.95, base + (u.modelsAgreed >= 2 ? 0.1 : 0));
}

/** Scout points (shown on /report/done): first to report > confirming > unverified. */
export function pointsFor(r: EventResult): number {
  if (r.reportStatus === "rejected") return 0;
  if (r.action === "created") return 25;
  if (r.action === "merged") return 10;
  return 5;
}

export async function applyToWorldState(u: EventUpdate): Promise<EventResult> {
  const { claim, verdict } = u;
  if (verdict.verdict === "reject") return { eventId: null, action: "none", reportStatus: "rejected", eventReports: 0 };

  const type = verdict.correctedEventType ?? claim.eventType;
  const status = verdict.correctedStatus ?? claim.status;
  const accepted = verdict.verdict === "accept";
  const existing = await findOpenEvent(u);
  const now = new Date().toISOString();
  const conf = reportConfidence(u);
  // Claim numbers win (the model saw the photo + SAM); SAM fills what the claim leaves out.
  const sam = u.sam ?? {};
  const cm = claim.measurements;
  const measured = {
    ...cm,
    blockedLengthM: cm.blockedLengthM ?? sam.blockedLengthM ?? null,
    blockedPct: cm.blockedPct ?? sam.blockedPct ?? null,
    roadTotalWidthM: sam.roadTotalWidthM ?? null,
  };
  const measurements = { ...measured, debrisVolumeM3: debrisVolumeM3(type, measured) };

  const timeline = (eventId: string, text: string) =>
    insert("event_timeline", {
      event_id: eventId,
      kind: "report",
      text,
      actor: "Traveller",
      data: {
        reportId: u.reportId, photoUrl: u.photoUrl, status, type,
        verdict: verdict.verdict, verifiedBy: u.verifiedBy, modelsAgreed: u.modelsAgreed,
        reasoning: verdict.reasoning,
      },
    });

  if (!existing) {
    // A single unverified ("pending") report doesn't put a pin on everyone's map.
    if (!accepted) return { eventId: null, action: "none", reportStatus: "pending", eventReports: 0 };
    const [ev] = await insert<{ id: string }>("events", {
      segment_id: u.segmentId,
      type,
      status: type === "clear" ? "open" : status,
      place_name: u.placeName,
      lat: u.lat,
      lng: u.lng,
      passable: claim.passable,
      measurements,
      summary: claim.summary,
      summary_hi: claim.summaryHi,
      confidence: conf,
      started_at: now,
      last_confirmed_at: now,
      sources: { reports: 1, official: 0, news: 0, notices: 0 },
      models_agreed: u.modelsAgreed,
    });
    await timeline(ev!.id, `Reported: ${claim.summary}`);
    return { eventId: ev!.id, action: "created", reportStatus: "accepted", eventReports: 1 };
  }

  const sources = { ...existing.sources, reports: (existing.sources?.reports ?? 0) + 1 };
  if (!accepted) {
    // Ambiguous evidence: keep it on the record, don't move the status.
    await update("events", `id=eq.${existing.id}`, { sources });
    await timeline(existing.id, `Unconfirmed report: ${claim.summary}`);
    return { eventId: existing.id, action: "noted", reportStatus: "pending", eventReports: sources.reports };
  }

  const clears = type === "clear" || status === "open";
  await update("events", `id=eq.${existing.id}`, {
    // A "clear" report reopens the road but keeps the event's original type for its history.
    ...(clears ? { status: "open", resolved_at: now } : { type, status }),
    passable: claim.passable,
    measurements,
    summary: claim.summary,
    summary_hi: claim.summaryHi,
    // Independent confirmations compound: 1 − Π(1 − cᵢ), damped so one report can't max it out.
    confidence: Math.min(0.97, 1 - (1 - existing.confidence) * (1 - conf * 0.6)),
    last_confirmed_at: now,
    sources,
    models_agreed: Math.max(existing.models_agreed ?? 0, u.modelsAgreed),
  });
  await timeline(existing.id, clears ? `Road reported clear again: ${claim.summary}` : `Confirmed: ${claim.summary}`);
  return { eventId: existing.id, action: "merged", reportStatus: "accepted", eventReports: sources.reports };
}
