// Impact of an open event, in plain code (no AI): how many vehicles it hits and how many
// vehicle-hours they lose before it clears. Ranks the Command Centre queue and feeds Crew Dispatch.
// All numbers are estimates — the UI prefixes them with "~" and calls them "est.".
import type { EventStatus } from "../events/types.ts";

/** Rough daily traffic by OSM road class in Himachal (two-way, all vehicles). */
const VEHICLES_PER_DAY: Record<string, number> = {
  motorway: 9000,
  trunk: 6000, // national highways (NH-3, NH-154, …)
  primary: 3000, // state highways
  secondary: 1500, // major district roads
  tertiary: 600,
  unclassified: 250,
  track: 60,
};

export const vehiclesPerDayOf = (highway: string | null | undefined) => VEHICLES_PER_DAY[highway ?? ""] ?? 400;

/** Hours each passing vehicle loses (closed = wait or detour). */
const DELAY_H: Record<EventStatus, number> = { closed: 2, one_lane: 0.33, slow: 0.15, unknown: 0.1, open: 0 };

/** When there's no eta_clear: how long such an event usually lasts if nobody clears it faster. */
function defaultHours(type: string, status: EventStatus): number {
  if (status === "open") return 0;
  if (type === "snow" || type === "ice") return status === "closed" ? 18 : 8;
  if (type === "traffic") return 3;
  if (type === "closure_notice") return 24;
  return status === "closed" ? 12 : status === "one_lane" ? 6 : 4;
}

export interface ImpactInput {
  type: string;
  status: EventStatus;
  highway: string | null;
  confidence: number;
  etaClear: { earliest: string; latest: string } | null;
}

export interface Impact {
  vehiclesPerDay: number;
  /** Hours until it clears (range); from eta_clear when known. */
  hoursLeft: { min: number; max: number };
  etaKnown: boolean;
  /** Vehicles that reach it before it clears (next 24 h at most). */
  vehiclesHit: number;
  /** Lost vehicle-hours before it clears, weighted by how sure we are — the ranking score. */
  vehicleHours: number;
}

export function impactOf(e: ImpactInput, now = Date.now()): Impact {
  const vehiclesPerDay = VEHICLES_PER_DAY[e.highway ?? ""] ?? 400;
  const latest = e.etaClear ? (new Date(e.etaClear.latest).getTime() - now) / 3_600_000 : NaN;
  const earliest = e.etaClear ? (new Date(e.etaClear.earliest).getTime() - now) / 3_600_000 : NaN;
  const etaKnown = Number.isFinite(latest) && latest > 0;
  const def = defaultHours(e.type, e.status);
  const hoursLeft = etaKnown
    ? { min: Math.max(0.5, earliest), max: Math.max(1, latest) }
    : { min: def * 0.75, max: def };
  if (e.status === "open" || e.type === "clear") hoursLeft.min = hoursLeft.max = 0;
  const mid = (hoursLeft.min + hoursLeft.max) / 2;
  const vehiclesHit = e.status === "open" ? 0 : Math.round((vehiclesPerDay * Math.min(24, mid)) / 24);
  return { vehiclesPerDay, hoursLeft, etaKnown, vehiclesHit, vehicleHours: vehicleHoursIf(e, mid) };
}

/** Lost vehicle-hours if the event clears in `hours` from now (what-if for Crew Dispatch). */
export function vehicleHoursIf(e: ImpactInput, hours: number): number {
  if (e.status === "open" || e.type === "clear") return 0;
  const vehiclesPerDay = VEHICLES_PER_DAY[e.highway ?? ""] ?? 400;
  const hit = (vehiclesPerDay * Math.min(24, Math.max(0, hours))) / 24;
  return Math.round(hit * DELAY_H[e.status] * Math.max(0.3, e.confidence));
}
