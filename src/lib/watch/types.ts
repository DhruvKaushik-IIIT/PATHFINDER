// Client-safe shapes for watched trips (Road Watch) and alerts.
import type { Verdict } from "../geo/routeTypes.ts";

export interface PlacePoint {
  name: string;
  lat: number;
  lng: number;
}

/** What Road Watch remembers about a trip's best route, to notice changes in plain code. */
export interface WatchSnapshot {
  /** Disruptions on ANY route option (so a switch of the best route alone isn't reported as new events). */
  events: { id: string; status: string; title: string }[];
  /** Main road of the recommended option, e.g. "NH-3". */
  via: string | null;
  /** Bounding box of every route option (W,S,E,N) — which trips does a new event touch? */
  bbox: [number, number, number, number];
  arriveAt: string;
  checkedAt: string;
}

export interface WatchedTrip {
  id: string;
  from: PlacePoint;
  to: PlacePoint;
  /** null = "leave now" (re-checked against the current time). */
  departAt: string | null;
  active: boolean;
  createdAt: string;
  lastVerdict: { verdict: Verdict; headline: string; headlineHi?: string | null } | null;
}

export interface TripChange {
  kind: "new" | "cleared" | "status" | "route";
  eventId: string;
  title: string;
  from?: string;
  to?: string;
}

export interface Alert {
  id: string;
  kind: "road_watch" | "scout_request" | "info";
  title: string;
  body: string | null;
  data: {
    tripId?: string;
    /** "Mandi → Manali" */
    trip?: string;
    url?: string;
    verdict?: Verdict;
    changes?: TripChange[];
    by?: string;
    /** Official advisory (Command Centre): Hindi text + event. */
    advisory?: boolean;
    hi?: string;
    eventId?: string;
  } | null;
  read: boolean;
  createdAt: string;
}

/** /route link for a watched trip (a past departure means "leave now"). */
export function routeUrl(from: PlacePoint, to: PlacePoint, departAt: string | null): string {
  const q = new URLSearchParams({
    from: `${from.lat.toFixed(5)},${from.lng.toFixed(5)}`,
    to: `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`,
    fromName: from.name,
    toName: to.name,
  });
  if (departAt && new Date(departAt).getTime() > Date.now()) q.set("depart", departAt);
  return `/route?${q}`;
}
