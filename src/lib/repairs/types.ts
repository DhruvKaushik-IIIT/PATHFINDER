// Client-safe: crews at work on events, as travellers see them (frame 07 Repairs on route, frame 05 crew card).
import type { EventStatus } from "../events/types.ts";
import type { RoutePlan } from "../geo/routeTypes.ts";

export interface Repair {
  eventId: string;
  title: string;
  road: string | null;
  status: EventStatus;
  resolved: boolean;
  org: string;
  crewName: string | null;
  machines: string[];
  pctCleared: number | null;
  /** Official "fully open by", else the event's clearing estimate. */
  fullyOpenAt: string | null;
  lastUpdateAt: string | null;
  /** AI photo check of the latest official update. */
  check: "ok" | "warn" | "unknown" | null;
  /** A crew is assigned, or an official update came in the last 12 h. */
  atWork: boolean;
}

/** ["JCB","JCB","Tipper"] / ["2 JCB","1 tipper"] → "2 JCB + tipper" style text. */
export function machinesLabel(m: string[]): string {
  if (!m.length) return "—";
  if (m.some((x) => /^\d/.test(x))) return m.join(", ");
  const counts = new Map<string, number>();
  for (const x of m) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].map(([name, n]) => `${n > 1 ? `${n} ` : ""}${name}`).join(" + ");
}

/** Event ids on the recommended route first, then the alternatives. */
export function routeEventIds(plan: RoutePlan): string[] {
  return [...new Set(plan.routes.flatMap((r) => r.events.map((e) => e.id)))];
}
