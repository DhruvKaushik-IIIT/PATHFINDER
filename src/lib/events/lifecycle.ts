// Event lifecycle (docs/event-lifecycle.md): every event has a shelf life without new confirmation.
// Half of it → "Unconfirmed" (grey, no route delay, no new alerts); all of it → closed automatically.
// Pure code, no AI, client-safe (the UI and the server use the same numbers).

export type LifecycleState = "active" | "unconfirmed" | "expired";

export interface Lifecycle {
  state: LifecycleState;
  /** Hours of shelf life for this type/status (after the news-only rule). Null = never expires (demo). */
  shelfLifeH: number | null;
  unconfirmedAt: string | null;
  expiresAt: string | null;
  /** Why it is unconfirmed/expired, for the UI ("No new reports for 2 days"). */
  reason: string | null;
}

export interface LifecycleInput {
  type: string;
  status: string;
  lastConfirmedAt: string;
  reports?: number;
  official?: number;
  news?: number;
  isDemo?: boolean | null;
  etaClear?: { earliest: string; latest: string } | null;
  potholeSize?: string | null;
}

const H = 1;
const D = 24;

/** Shelf life in hours by type and status (docs/event-lifecycle.md §1). */
export function shelfLifeH(type: string, status: string, potholeSize?: string | null): number {
  const closed = status === "closed";
  switch (type) {
    case "traffic":
      return 6 * H;
    case "accident":
      return closed ? 12 * H : 6 * H;
    case "ice":
      return 24 * H;
    case "snow":
    case "flood_water":
      return closed ? 48 * H : 24 * H;
    case "landslide":
      return closed ? 72 * H : status === "one_lane" ? 48 * H : 24 * H;
    case "road_damage":
      return closed ? 7 * D : 5 * D;
    case "pothole":
      return potholeSize === "severe" || status === "one_lane" || closed ? 21 * D : 14 * D;
    case "closure_notice":
      return 72 * H; // or the notice's own end date (eta_clear), see lifecycleOf
    default:
      return 24 * H;
  }
}

function humanSpan(h: number): string {
  if (h < 1.5) return "an hour";
  if (h < 36) return `${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d === 1 ? "a day" : `${d} days`;
}

export function lifecycleOf(e: LifecycleInput, now = Date.now()): Lifecycle {
  if (e.isDemo) return { state: "active", shelfLifeH: null, unconfirmedAt: null, expiresAt: null, reason: null };
  const last = new Date(e.lastConfirmedAt).getTime();
  let life = shelfLifeH(e.type, e.status, e.potholeSize);
  // News-only (no photo, no official update) is weaker evidence: half the shelf life.
  if ((e.reports ?? 0) === 0 && (e.official ?? 0) === 0 && (e.news ?? 0) > 0) life /= 2;
  let expires = last + life * 3_600_000;
  // A closure notice lasts until its own end date when it has one.
  if (e.type === "closure_notice" && e.etaClear?.latest) expires = Math.max(expires, new Date(e.etaClear.latest).getTime());
  let unconfirmed = last + (expires - last) / 2;
  let reason: string | null = null;
  // A promised reopening time that passed with no news since → unconfirmed straight away.
  const promised = e.type !== "closure_notice" && e.etaClear?.latest ? new Date(e.etaClear.latest).getTime() : null;
  if (promised && promised > last && promised < unconfirmed) {
    unconfirmed = promised;
    reason = "Expected to reopen by now · no new report since";
  }
  const sinceH = (now - last) / 3_600_000;
  const state: LifecycleState = now >= expires ? "expired" : now >= unconfirmed ? "unconfirmed" : "active";
  if (state !== "active" && !reason) reason = `No new reports for ${humanSpan(sinceH)}`;
  if (state === "expired") reason = `No new reports for ${humanSpan(sinceH)}, removed automatically`;
  return {
    state,
    shelfLifeH: life,
    unconfirmedAt: new Date(unconfirmed).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    reason: state === "active" ? null : reason,
  };
}
