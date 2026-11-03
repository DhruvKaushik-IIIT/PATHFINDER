// Server-only: Verifier v1 world-state update (CLAUDE.md 6.1 VERIFY → WORLD STATE).
// A verified claim either merges into the open event on the same segment (seen in the last
// 24 h) or creates a new one. Every change adds a timeline item. Latest verified evidence wins
// for status (roads change by the hour); confidence grows with independent confirmations.
import type { Claim, Verdict } from "../ai/schemas.ts";
import { debrisVolumeM3, type Range } from "../clearing/estimate.ts";
import { insert, select } from "../db/supabase.ts";
import type { VerificationRecord } from "../verification/types.ts";
import { lifecycleOf, type Taps } from "../events/lifecycle.ts";
import { closeExpired } from "../events/expire.ts";
import { bumpReports, mutateEvent } from "../events/mutate.ts";

const NEAR_DEG = 0.003; // ~300 m box when the report could not be snapped to a segment
// Time-consistency (Phase 5 stretch): an old photo can't say what the road is like NOW, and a
// contradicting report minutes after a confirmation doesn't flip the status unless it is more certain.
export const OLD_PHOTO_H = 6;
const FLIP_WINDOW_MIN = 30;
const ago = (h: number) => (h < 48 ? `~${Math.round(h)} h` : `~${Math.round(h / 24)} days`);

export interface EventRow {
  id: string;
  segment_id: string | null;
  type: string;
  status: string;
  confidence: number;
  sources: { reports: number; official: number; news: number; notices: number };
  models_agreed: number | null;
  last_confirmed_at: string;
  eta_clear?: { earliest: string; latest: string } | null;
  measurements?: { potholeSize?: string | null } | null;
  is_demo?: boolean | null;
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
  /** Who wrote / who checked the claim (dual-model verification), stored on the timeline item. */
  verification?: VerificationRecord | null;
  /** Photo taken this many hours before it was sent (library pick); > OLD_PHOTO_H → history only. */
  photoAgeH?: number | null;
  /** SAM's own numbers for the photo (road width, etc.), merged under the claim's. */
  sam?: { roadTotalWidthM?: Range; blockedLengthM?: Range; blockedPct?: Range } | null;
  /** B4: why this photo can't count as "taken here, now" (no camera data / looks downloaded). Never makes or moves a pin. */
  unverifiedUpload?: string | null;
  /** Placed on the map by someone not at the spot (/report "Pick a spot", B1): demo data — it only merges into
   *  demo events (never touches real ones) and a new event is is_demo + sources.placed (expires like a real one). */
  placed?: boolean;
}

export interface EventResult {
  eventId: string | null;
  action: "created" | "merged" | "noted" | "none";
  reportStatus: "accepted" | "pending" | "rejected";
  /** Reports on the event including this one (0 when no event). */
  eventReports: number;
  /** Why a verified report didn't change the road's status (old photo / conflicts with a fresh confirmation). */
  timeCheck?: string;
}

/** The open event at this spot that is still within its shelf life (docs/event-lifecycle.md).
 *  One past its shelf life is closed first, so the new report starts a fresh event. */
async function findOpenEvent(u: EventUpdate): Promise<EventRow | null> {
  const cols = "id,segment_id,type,status,confidence,sources,models_agreed,last_confirmed_at,eta_clear,measurements,is_demo";
  const where = u.segmentId
    ? `segment_id=eq.${encodeURIComponent(u.segmentId)}`
    : `lat=gte.${u.lat - NEAR_DEG}&lat=lte.${u.lat + NEAR_DEG}&lng=gte.${u.lng - NEAR_DEG}&lng=lte.${u.lng + NEAR_DEG}`;
  const [row] = await select<EventRow>(
    "events",
    `select=${cols}&${where}&resolved_at=is.null${u.placed ? "&is_demo=is.true" : ""}&order=last_confirmed_at.desc&limit=1`,
  );
  if (!row) return null;
  const life = lifecycleOf({
    type: row.type, status: row.status, lastConfirmedAt: row.last_confirmed_at, reports: row.sources?.reports,
    official: row.sources?.official, news: row.sources?.news, etaClear: row.eta_clear, potholeSize: row.measurements?.potholeSize,
    isDemo: row.is_demo, placed: Boolean((row.sources as { placed?: boolean } | null)?.placed), taps: (row.sources as { taps?: Taps } | null)?.taps,
  });
  if (life.state === "expired") {
    await closeExpired([{ id: row.id, reason: life.reason }]).catch(() => {});
    return null;
  }
  return row;
}

/** Combined confidence of one verified report: both models' views, a bonus when they agree. */
function reportConfidence(u: EventUpdate): number {
  const base = (u.claim.confidence + u.verdict.confidence) / 2;
  return Math.min(0.95, base + (u.modelsAgreed >= 2 ? 0.1 : 0));
}

/** Scout points (shown on /report/done): first to report > confirming > unverified. */
export function pointsFor(r: EventResult, verdict?: Verdict | null): number {
  // "−10 confident fake" (frame 12): only when the verifier was sure; a doubtful reject costs nothing.
  if (r.reportStatus === "rejected") return verdict && verdict.verdict === "reject" && verdict.confidence >= 0.8 ? -10 : 0;
  if (r.action === "created") return 25;
  if (r.action === "merged") return 10;
  return 5;
}

export async function applyToWorldState(u: EventUpdate): Promise<EventResult> {
  const { claim, verdict } = u;
  if (verdict.verdict === "reject") return { eventId: null, action: "none", reportStatus: "rejected", eventReports: 0 };

  const type = verdict.correctedEventType ?? claim.eventType;
  // Potholes are common in India: size decides (docs/event-lifecycle.md). Minor = a rough road, not a disruption.
  const potholeSize = type === "pothole" ? (verdict.correctedPotholeSize ?? claim.potholeSize ?? null) : null;
  const status =
    potholeSize === "minor" ? "open" : potholeSize === "medium" ? "slow" : potholeSize === "severe" ? "one_lane" : (verdict.correctedStatus ?? claim.status);
  const accepted = verdict.verdict === "accept";
  const existing = await findOpenEvent(u);
  if (potholeSize === "minor" && !existing) {
    return {
      eventId: null, action: "none", reportStatus: accepted ? "accepted" : "pending", eventReports: 0,
      timeCheck: "Minor potholes: saved as a rough-road note, not shown as a disruption",
    };
  }
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
  const measurements = { ...measured, debrisVolumeM3: debrisVolumeM3(type, measured), ...(potholeSize && { potholeSize }) };

  const timeline = (eventId: string, text: string) =>
    insert("event_timeline", {
      event_id: eventId,
      kind: "report",
      text,
      actor: u.placed ? "Traveller · placed on map (demo)" : "Traveller",
      ...(u.placed && { is_demo: true }),
      data: {
        reportId: u.reportId, photoUrl: u.photoUrl, status, type,
        verdict: verdict.verdict, verifiedBy: u.verifiedBy, modelsAgreed: u.modelsAgreed,
        reasoning: verdict.reasoning,
        ...(u.verification && { verification: u.verification }),
      },
    });

  // B4: an uploaded photo with no proof it was taken here and now (no camera data, or the checker saw a
  // watermark/logo/screenshot). Kept on the record, never creates a pin or changes a status, no points.
  if (u.unverifiedUpload && !u.placed) {
    const note = `${u.unverifiedUpload} — not counted until someone on the spot confirms it with the camera`;
    if (!existing) return { eventId: null, action: "none", reportStatus: "pending", eventReports: 0, timeCheck: note };
    await timeline(existing.id, `Uploaded photo, not counted (${u.unverifiedUpload.toLowerCase()}): ${claim.summary}`);
    return { eventId: existing.id, action: "noted", reportStatus: "pending", eventReports: existing.sources?.reports ?? 0, timeCheck: note };
  }

  // Old photo (library pick): evidence of what WAS there, never the current state.
  if (u.photoAgeH != null && u.photoAgeH > OLD_PHOTO_H) {
    const note = `Photo taken ${ago(u.photoAgeH)} ago — kept as history, not as the road's current state`;
    if (!existing) return { eventId: null, action: "none", reportStatus: "pending", eventReports: 0, timeCheck: note };
    const reports = await bumpReports(existing.id);
    await timeline(existing.id, `Older photo (taken ${ago(u.photoAgeH)} ago): ${claim.summary}`);
    return { eventId: existing.id, action: "noted", reportStatus: "pending", eventReports: reports, timeCheck: note };
  }

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
      sources: { reports: 1, official: 0, news: 0, notices: 0, ...(u.placed && { placed: true }) },
      models_agreed: u.modelsAgreed,
      ...(u.placed && { is_demo: true }),
    });
    await timeline(ev!.id, `Reported: ${claim.summary}`);
    return { eventId: ev!.id, action: "created", reportStatus: "accepted", eventReports: 1 };
  }

  if (!accepted) {
    // Ambiguous evidence: keep it on the record, don't move the status.
    const reports = await bumpReports(existing.id);
    await timeline(existing.id, `Unconfirmed report: ${claim.summary}`);
    return { eventId: existing.id, action: "noted", reportStatus: "pending", eventReports: reports };
  }

  // Flip-flop guard: the same spot confirmed as something else minutes ago, and this report is less
  // certain → keep the status, put the conflict on the record (the Investigator reads it).
  const newStatus = type === "clear" ? "open" : status;
  const minsSince = (Date.now() - new Date(existing.last_confirmed_at).getTime()) / 60_000;
  if (newStatus !== existing.status && minsSince < FLIP_WINDOW_MIN && conf < existing.confidence) {
    const note = `Conflicts with "${existing.status.replace("_", " ")}" confirmed ${Math.max(1, Math.round(minsSince))} min ago — status kept until another report or the Investigator settles it`;
    const reports = await bumpReports(existing.id);
    await timeline(existing.id, `Conflicting report (says ${newStatus.replace("_", " ")}): ${claim.summary} · status kept`);
    return { eventId: existing.id, action: "noted", reportStatus: "pending", eventReports: reports, timeCheck: note };
  }

  const clears = type === "clear" || status === "open";
  // Counts and confidence come from the FRESH row (optimistic locking): parallel reports/votes all count.
  let reports = (existing.sources?.reports ?? 0) + 1;
  await mutateEvent<EventRow>(existing.id, "sources,confidence,models_agreed", (row) => {
    reports = (row.sources?.reports ?? 0) + 1;
    return {
      // A "clear" report reopens the road but keeps the event's original type for its history.
      ...(clears ? { status: "open", resolved_at: now } : { type, status }),
      passable: claim.passable,
      measurements,
      summary: claim.summary,
      summary_hi: claim.summaryHi,
      // Independent confirmations compound: 1 − Π(1 − cᵢ), damped so one report can't max it out.
      confidence: Math.min(0.97, 1 - (1 - row.confidence) * (1 - conf * 0.6)),
      last_confirmed_at: now,
      sources: { ...row.sources, reports },
      models_agreed: Math.max(row.models_agreed ?? 0, u.modelsAgreed),
    };
  });
  await timeline(existing.id, clears ? `Road reported clear again: ${claim.summary}` : `Confirmed: ${claim.summary}`);
  return { eventId: existing.id, action: "merged", reportStatus: "accepted", eventReports: reports };
}
