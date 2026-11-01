// Server-only: "Still there?" one-tap checks (docs/event-lifecycle.md §2). Plain code, no AI.
// A Yes confirms the event now and scales its shelf life by the answer; a No makes it Unconfirmed;
// 3 Nos from different devices within 6 h (no full Yes after) close it early. Taps never change the status.
import { insert, select, update } from "../db/supabase.ts";
import { closeExpired } from "./expire.ts";
import { lifecycleOf, type Taps } from "./lifecycle.ts";

export const TAP_ANSWERS = ["worse", "same", "partly", "almost_clear", "gone"] as const;
export type TapAnswer = (typeof TAP_ANSWERS)[number];

/** Shelf-life factor per Yes answer. */
export const TAP_FACTOR: Record<Exclude<TapAnswer, "gone">, number> = { worse: 1.5, same: 1, partly: 0.5, almost_clear: 0.25 };
const TAP_TEXT: Record<TapAnswer, string> = {
  worse: "still there, worse than shown",
  same: "still there, about the same",
  partly: "still there, partly cleared",
  almost_clear: "almost clear",
  gone: "it's gone",
};
export const NEAR_KM = 2;
export const MAX_TAP_KMH = 20;
const VOTE_EVERY_H = 6;
const CLOSE_AT = 3;

export interface TapResult {
  ok: boolean;
  /** HTTP-ish code for the route: 200 ok · 403 too far · 409 already answered · 410 gone · 422 moving. */
  code: number;
  message: string;
  state?: "active" | "unconfirmed" | "closed";
}

interface Row {
  id: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  confidence: number;
  last_confirmed_at: string;
  sources: { reports?: number; official?: number; news?: number; notices?: number; taps?: Taps } | null;
  eta_clear: { earliest: string; latest: string } | null;
  measurements: { potholeSize?: string | null } | null;
  is_demo: boolean | null;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371;
}

/** Weight of the No votes still counting: within 6 h, one per device (its heaviest). */
export function noWeight(nos: Taps["nos"], now = Date.now()): { weight: number; devices: number } {
  const per = new Map<string, number>();
  for (const n of nos ?? []) {
    if (now - new Date(n.at).getTime() > VOTE_EVERY_H * 3_600_000) continue;
    per.set(n.d, Math.max(per.get(n.d) ?? 0, n.w));
  }
  return { weight: [...per.values()].reduce((a, b) => a + b, 0), devices: per.size };
}

/** Pure: the new taps record + confidence after one answer. Exported for tests. */
export function applyTap(
  taps: Taps | undefined,
  confidence: number,
  answer: TapAnswer,
  device: string,
  now = Date.now(),
): { taps: Taps; confidence: number; confirms: boolean } {
  const at = new Date(now).toISOString();
  const recent = (taps?.nos ?? []).filter((n) => now - new Date(n.at).getTime() <= VOTE_EVERY_H * 3_600_000);
  if (answer === "gone") {
    return { taps: { ...taps, noAt: at, nos: [...recent, { d: device, at, w: 1 }] }, confidence: Math.max(0.15, confidence - 0.1), confirms: false };
  }
  // Almost clear: a short new shelf life AND half a No. Worse / same / partly: a full Yes cancels earlier Nos.
  const nos = answer === "almost_clear" ? [...recent, { d: device, at, w: 0.5 }] : [];
  return {
    taps: { at, factor: TAP_FACTOR[answer], nos, ...(answer === "almost_clear" && taps?.noAt ? { noAt: taps.noAt } : {}) },
    confidence: answer === "almost_clear" ? confidence : Math.min(0.95, confidence + 0.05),
    confirms: true,
  };
}

export async function recordTap(input: {
  eventId: string;
  answer: TapAnswer;
  device: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
}): Promise<TapResult> {
  const [ev] = await select<Row>(
    "events",
    `select=id,type,status,lat,lng,confidence,last_confirmed_at,sources,eta_clear,measurements,is_demo&id=eq.${input.eventId}&resolved_at=is.null&limit=1`,
  );
  if (!ev) return { ok: false, code: 410, message: "This one has already been removed" };
  if (input.speedKmh != null && input.speedKmh > MAX_TAP_KMH)
    return { ok: false, code: 422, message: "Answer when you've slowed down or stopped" };
  if (km(ev, input) > NEAR_KM) return { ok: false, code: 403, message: "You need to be near the spot to answer" };
  const life = lifecycleOf({
    type: ev.type, status: ev.status, lastConfirmedAt: ev.last_confirmed_at, reports: ev.sources?.reports, official: ev.sources?.official,
    news: ev.sources?.news, isDemo: ev.is_demo, etaClear: ev.eta_clear, potholeSize: ev.measurements?.potholeSize, taps: ev.sources?.taps,
  });
  if (life.state === "expired") return { ok: false, code: 410, message: "This one has already been removed" };

  // One vote per device per event every 6 h (the timeline line is the record).
  const since = new Date(Date.now() - VOTE_EVERY_H * 3_600_000).toISOString();
  const prior = await select<{ id: string }>(
    "event_timeline",
    `select=id&event_id=eq.${ev.id}&data->>tapBy=eq.${input.device}&at=gte.${since}&limit=1`,
  );
  if (prior.length) return { ok: false, code: 409, message: "You already answered for this spot. Thanks!" };

  const next = applyTap(ev.sources?.taps, ev.confidence, input.answer, input.device);
  const now = new Date().toISOString();
  await update("events", `id=eq.${ev.id}`, {
    sources: { ...ev.sources, taps: next.taps },
    confidence: next.confidence,
    ...(next.confirms && { last_confirmed_at: now }),
  });
  await insert("event_timeline", {
    event_id: ev.id,
    kind: "report",
    text: `Traveller passing by: ${TAP_TEXT[input.answer]}`,
    actor: "Traveller (one tap)",
    data: { tap: true, tapBy: input.device, answer: input.answer },
  });

  const nw = noWeight(next.taps.nos);
  if (!ev.is_demo && nw.weight >= CLOSE_AT) {
    const reason = `Closed early: ${nw.devices} travellers passing by said it's gone`;
    await closeExpired([{ id: ev.id, reason }]);
    const { roadWatchAfterChange } = await import("../watch/roadWatch.ts");
    await roadWatchAfterChange([{ lat: ev.lat, lng: ev.lng }]).catch(() => {});
    return { ok: true, code: 200, message: "Thanks! Enough travellers said it's gone, so it's removed from the map.", state: "closed" };
  }
  return {
    ok: true,
    code: 200,
    state: next.confirms ? "active" : "unconfirmed",
    message: next.confirms
      ? "Thanks! Travellers will see it's still there."
      : "Thanks! It now shows as unconfirmed. If others agree, it's removed.",
  };
}
