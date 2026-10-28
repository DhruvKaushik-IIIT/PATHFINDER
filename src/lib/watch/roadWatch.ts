// Server-only: watched trips + Road Watch (CLAUDE.md 5.4 budget rule: event-driven, NOT a timer on
// the AI). Plain code re-plans the route (OSRM + events, no AI) and compares the disruptions on the
// best route with the last snapshot. Only when something changed does the Route Check agent re-plan
// (same tiers as /route: Spark for one issue, Wonder for several/closures) → an alert for the owner.
import { insert, select, update } from "../db/supabase.ts";
import { checkRoute } from "../geo/check.ts";
import { planRoute } from "../geo/route.ts";
import type { RoutePlan } from "../geo/routeTypes.ts";
import { eventTitle, STATUS_STYLE, type EventStatus } from "../events/types.ts";
import { routeUrl, type PlacePoint, type TripChange, type WatchedTrip, type WatchSnapshot } from "./types.ts";

const MAX_TRIPS_PER_RUN = 25;
const STALE_AFTER_H = 12; // a trip whose departure was >12 h ago stops being watched
const PAD = 0.05; // ~5 km around the route bbox when matching a changed event

interface TripRow {
  id: string;
  user_id: string | null;
  from_place: PlacePoint;
  to_place: PlacePoint;
  depart_at: string | null;
  route_cache: WatchSnapshot | null;
  last_verdict: WatchedTrip["lastVerdict"];
  active: boolean;
  created_at: string;
}

const COLS = "id,user_id,from_place,to_place,depart_at,route_cache,last_verdict,active,created_at";

function toTrip(r: TripRow): WatchedTrip {
  return {
    id: r.id,
    from: r.from_place,
    to: r.to_place,
    departAt: r.depart_at,
    active: r.active,
    createdAt: r.created_at,
    lastVerdict: r.last_verdict,
  };
}

/** Disruptions on every route option + the recommended road, as Road Watch remembers them. */
export function snapshot(plan: RoutePlan): WatchSnapshot {
  const best = plan.routes.find((r) => r.recommended) ?? plan.routes[0]!;
  const coords = plan.routes.flatMap((r) => r.geometry.coordinates);
  const lngs = coords.map((c) => c[0]!);
  const lats = coords.map((c) => c[1]!);
  const seen = new Map<string, WatchSnapshot["events"][number]>();
  for (const e of plan.routes.flatMap((r) => r.events)) {
    if ((e.delayMin > 0 || e.blocks) && !seen.has(e.id)) seen.set(e.id, { id: e.id, status: e.status, title: eventTitle(e.type, e.placeName) });
  }
  return {
    events: [...seen.values()],
    via: best.viaRoads[0] ?? best.viaTowns[0] ?? null,
    bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    arriveAt: best.arriveAt,
    checkedAt: plan.checkedAt,
  };
}

/** Plain-code diff of two snapshots. */
export function diff(old: WatchSnapshot | null, now: WatchSnapshot): TripChange[] {
  const before = new Map((old?.events ?? []).map((e) => [e.id, e]));
  const after = new Map(now.events.map((e) => [e.id, e]));
  const changes: TripChange[] = [];
  for (const e of now.events) {
    const was = before.get(e.id);
    if (!was) changes.push({ kind: "new", eventId: e.id, title: e.title, to: e.status });
    else if (was.status !== e.status) changes.push({ kind: "status", eventId: e.id, title: e.title, from: was.status, to: e.status });
  }
  for (const e of old?.events ?? []) if (!after.has(e.id)) changes.push({ kind: "cleared", eventId: e.id, title: e.title, from: e.status });
  // A new best road only matters alongside an event change (OSRM can reorder near-equal options).
  if (changes.length && old?.via && now.via && old.via !== now.via) {
    changes.push({ kind: "route", eventId: "", title: `Best route is now via ${now.via}`, from: old.via, to: now.via });
  }
  return changes;
}

const word = (s?: string) => (s ? STATUS_STYLE[s as EventStatus]?.word.toLowerCase() ?? s : "");

/** "Aut is now closed (was one lane)." · "New: one lane at Pandoh." · "Kataula has cleared." */
export function describe(changes: TripChange[]): string {
  return changes
    .slice(0, 3)
    .map((c) =>
      c.kind === "new"
        ? `New on your route: ${c.title} (${word(c.to)})`
        : c.kind === "status"
          ? `${c.title} is now ${word(c.to)} (was ${word(c.from)})`
          : c.kind === "cleared"
            ? `${c.title} no longer slows your route`
            : `${c.title} (was ${c.from})`,
    )
    .join(". ")
    .concat(changes.length > 3 ? `, and ${changes.length - 3} more change${changes.length > 4 ? "s" : ""}.` : ".");
}

function departure(trip: TripRow): Date {
  const t = trip.depart_at ? new Date(trip.depart_at) : null;
  return t && t.getTime() > Date.now() ? t : new Date();
}

// ---------------------------------------------------------------- trips (API)

export async function listTrips(userId: string): Promise<WatchedTrip[]> {
  const rows = await select<TripRow>("watched_trips", `select=${COLS}&user_id=eq.${userId}&active=is.true&order=created_at.desc&limit=20`);
  return rows.map(toTrip);
}

/** Start watching: snapshot the route now (no AI), so later checks can tell what changed. */
export async function watchTrip(
  userId: string,
  from: PlacePoint,
  to: PlacePoint,
  departAt: string | null,
  verdict: WatchedTrip["lastVerdict"],
): Promise<WatchedTrip> {
  // Same trip watched again → reuse the row.
  const [dup] = await select<TripRow>(
    "watched_trips",
    `select=${COLS}&user_id=eq.${userId}&active=is.true` +
      `&from_place->>name=eq.${encodeURIComponent(from.name)}&to_place->>name=eq.${encodeURIComponent(to.name)}&limit=1`,
  );
  const plan = await planRoute(from, to, departAt ? new Date(departAt) : new Date(), { fresh: true });
  const snap = snapshot(plan);
  const lastVerdict = verdict ?? { verdict: plan.routes[0]!.verdict.verdict, headline: plan.routes[0]!.verdict.pill };
  if (dup) {
    const [row] = await update<TripRow>("watched_trips", `id=eq.${dup.id}`, { depart_at: departAt, route_cache: snap, last_verdict: lastVerdict });
    return toTrip(row!);
  }
  const [row] = await insert<TripRow>("watched_trips", {
    user_id: userId,
    from_place: from,
    to_place: to,
    depart_at: departAt,
    route_cache: snap,
    last_verdict: lastVerdict,
  });
  return toTrip(row!);
}

export async function unwatchTrip(userId: string, id: string): Promise<boolean> {
  const rows = await update<TripRow>("watched_trips", `id=eq.${id}&user_id=eq.${userId}`, { active: false });
  return rows.length > 0;
}

// ---------------------------------------------------------------- Road Watch

export interface WatchResult {
  tripId: string;
  trip: string;
  outcome: "unchanged" | "alerted" | "stale" | "error";
  changes?: TripChange[];
  by?: string;
  detail?: string;
}

/** Re-check one trip. No AI unless the disruptions on its route changed. */
export async function checkTrip(trip: TripRow): Promise<WatchResult> {
  const name = `${trip.from_place.name} → ${trip.to_place.name}`;
  const base = { tripId: trip.id, trip: name };
  if (trip.depart_at && Date.now() - new Date(trip.depart_at).getTime() > STALE_AFTER_H * 3_600_000) {
    await update("watched_trips", `id=eq.${trip.id}`, { active: false });
    return { ...base, outcome: "stale" };
  }
  try {
    const departAt = departure(trip);
    const plan = await planRoute(trip.from_place, trip.to_place, departAt, { fresh: true });
    const snap = snapshot(plan);
    const changes = diff(trip.route_cache, snap);
    if (!changes.length) {
      await update("watched_trips", `id=eq.${trip.id}`, { route_cache: snap });
      return { ...base, outcome: "unchanged" };
    }

    // Something changed → the agent re-plans (cached per event state, so repeats are free).
    const { check } = await checkRoute(trip.from_place, trip.to_place, departAt);
    const v = check.verdict;
    const url = routeUrl(trip.from_place, trip.to_place, trip.depart_at);
    if (trip.user_id) {
      await insert("alerts", {
        user_id: trip.user_id,
        kind: "road_watch",
        title: `Your ${name} trip changed`,
        body: `${describe(changes)} ${v.headline}`,
        data: { tripId: trip.id, trip: name, url, verdict: v.verdict, headlineHi: v.headlineHi, changes, by: check.by },
      });
    }
    await update("watched_trips", `id=eq.${trip.id}`, {
      route_cache: snap,
      last_verdict: { verdict: v.verdict, headline: v.headline, headlineHi: v.headlineHi },
    });
    return { ...base, outcome: "alerted", changes, by: check.by };
  } catch (err) {
    return { ...base, outcome: "error", detail: (err as Error).message.slice(0, 160) };
  }
}

/**
 * Run Road Watch. With `near` (changed events' positions) only trips whose route passes within ~5 km
 * are re-checked — that is the event-driven path called after a report / news item / official update.
 * Without it: a sweep over all active trips (the cron safety net).
 */
export async function runRoadWatch(near?: { lat: number; lng: number }[], budgetMs = 240_000): Promise<WatchResult[]> {
  const deadline = Date.now() + budgetMs;
  const rows = await select<TripRow>("watched_trips", `select=${COLS}&active=is.true&order=created_at.desc&limit=200`);
  const touched = near
    ? rows.filter((t) => {
        const b = t.route_cache?.bbox;
        return !b || near.some((p) => p.lng >= b[0] - PAD && p.lng <= b[2] + PAD && p.lat >= b[1] - PAD && p.lat <= b[3] + PAD);
      })
    : rows;
  const results: WatchResult[] = [];
  // Sequential: OSRM's demo server and the agent are the slow parts; don't hammer them.
  for (const t of touched.slice(0, MAX_TRIPS_PER_RUN)) {
    if (Date.now() > deadline) break; // the rest are picked up by the next event or sweep
    results.push(await checkTrip(t));
  }
  return results;
}

/** Fire-and-forget hook for code that just changed an event. Never throws. */
export async function roadWatchAfterChange(points: { lat: number; lng: number }[]): Promise<void> {
  if (!points.length) return;
  try {
    const res = await runRoadWatch(points);
    if (res.length) console.info("[road-watch]", JSON.stringify(res.map((r) => `${r.trip}: ${r.outcome}`)));
  } catch (err) {
    console.warn("[road-watch] failed:", (err as Error).message);
  }
}
