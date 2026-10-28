// Client-safe shapes for the Command Centre.
import type { EventStatus, MapEvent } from "../events/types.ts";
import type { District } from "./districts.ts";

export interface QueueItem {
  rank: number;
  event: MapEvent;
  /** "NH-3 km 212"-style location line; null when unknown. */
  road: string | null;
  vehiclesPerDay: number;
  vehiclesHit: number;
  vehicleHours: number;
  hoursLeft: { min: number; max: number };
  etaKnown: boolean;
  debrisM3: { min: number; max: number } | null;
  crew: { id: string; name: string; machines: string[] } | null;
  status: EventStatus;
}

export interface CrewInfo {
  id: string;
  name: string;
  org: string;
  machines: string[];
  available: boolean;
  currentEventId: string | null;
}

export interface CommandCentre {
  official: { name: string; org: string; role: string; district: District };
  stats: { active: number; crewsFree: number; crewsTotal: number; vehiclesHit: number; watching: number };
  queue: QueueItem[];
  crews: CrewInfo[];
}

/** "6–8 h" · "~3 h" · "45 min" */
export function hoursText(h: { min: number; max: number }): string {
  const f = (x: number) => (x < 1 ? `${Math.max(15, Math.round((x * 60) / 15) * 15)} min` : `${Math.round(x)} h`);
  if (h.max <= 0) return "clear";
  const lo = Math.round(h.min);
  const hi = Math.round(h.max);
  if (h.max < 1 || lo === hi) return `~${f(h.max)}`;
  return `${lo}–${hi} h`;
}

/** 1234 → "1,200" (estimates are rounded so they don't look precise). */
export function roughCount(n: number): string {
  const step = n >= 1000 ? 100 : n >= 100 ? 10 : 1;
  return (Math.round(n / step) * step).toLocaleString("en-IN");
}
