// Server-only: A → B route plan WITHOUT any AI call (CLAUDE.md 7.5b / 7.5c).
// OSRM routes → split at the Himachal border → open events on the HP part → ETAs with delays
// → a verdict built in plain code. The Route Check agent (Phase 2 Part B) reasons on top of this.
import { booleanPointInPolygon, lineString, nearestPointOnLine, point, simplify } from "@turf/turf";
import { hasDb, rpc, select } from "../db/supabase.ts";
import { openEventsInBbox } from "../events/queries.ts";
import type { MapEvent } from "../events/types.ts";
import { HP_BOUNDARY } from "./hpBoundary.ts";
import { osrmRoutes, type OsrmRoute } from "./osrm.ts";
import type { CodeVerdict, RouteEvent, RouteLeg, RouteOption, RoutePlan } from "./routeTypes.ts";
import { nearestPlace } from "./snap.ts";

export interface NamedPoint {
  name: string;
  lat: number;
  lng: number;
}

/** OSRM's car profile assumes plains speeds; HP hill roads average ~30–35 km/h (Mandi→Manali ≈ 110 km in 3.5 h). */
const HILL_KMH = 32;
const TIME_MODEL = `OSRM drive time; inside Himachal no stretch is counted faster than ${HILL_KMH} km/h (hill-road correction)`;
/** Extra minutes per event status (7.5b). Closed → the route is blocked instead. */
const DELAY_MIN: Partial<Record<string, number>> = { one_lane: 20, slow: 10, unknown: 5 };
/** An event on a road this route uses may sit a little off OSRM's line; one on another road must be right on it
 *  (a side road running beside the highway must not block the highway). */
const NEAR_SAME_ROAD_KM = 0.3;
const NEAR_OTHER_ROAD_KM = 0.075;
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const clock = (d: Date) => IST.format(d).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);

/** "NH3" → "NH-3", "MDR 29" → "MDR-29"; names stay as they are. */
function roadLabel(k: string): string {
  const m = /^([A-Z]{2,4})\s?-?(\d+[A-Z]?)$/.exec(k.trim());
  return m ? `${m[1]}-${m[2]}` : k;
}

function where(e: MapEvent): string {
  return e.placeName ?? e.roadRef ?? "a spot on the route";
}

interface TownRow {
  name: string;
  lat: number;
  lng: number;
}

async function analyse(
  r: OsrmRoute,
  idx: number,
  ctx: { from: NamedPoint; to: NamedPoint; departAt: Date; events: MapEvent[]; towns: TownRow[] },
): Promise<Omit<RouteOption, "recommended" | "verdict">> {
  const coords = r.coordinates;
  const inside = coords.map((c) => booleanPointInPolygon(c, HP_BOUNDARY));

  // Per-segment time with the hill-road correction, then cumulative time/distance per coordinate.
  const cumS = [0];
  const cumM = [0];
  for (let i = 0; i < r.segDurS.length; i++) {
    const d = r.segDistM[i]!;
    const t = inside[i] ? Math.max(r.segDurS[i]!, d / (HILL_KMH / 3.6)) : r.segDurS[i]!;
    cumS.push(cumS[i]! + t);
    cumM.push(cumM[i]! + d);
  }
  const totalS = cumS[cumS.length - 1]!;

  // Legs = runs of inside/outside HP. Name each border crossing after the nearest HP place.
  const legs: RouteLeg[] = [];
  const legStart: number[] = [];
  let start = 0;
  for (let i = 1; i <= coords.length; i++) {
    if (i < coords.length && inside[i] === inside[start]) continue;
    const end = Math.min(i, coords.length - 1);
    legStart.push(start);
    legs.push({
      insideHp: inside[start]!,
      distanceKm: (cumM[end]! - cumM[start]!) / 1000,
      durationMin: (cumS[end]! - cumS[start]!) / 60,
      fromName: start === 0 ? ctx.from.name : null,
      toName: end === coords.length - 1 ? ctx.to.name : null,
    });
    start = i;
  }
  // Crossings are few (usually 0–2); look their names up in parallel.
  const lookups: Promise<void>[] = [];
  for (let l = 0; l < legs.length - 1; l++) {
    const [lng, lat] = coords[legStart[l + 1]!]!;
    lookups.push(
      // Border crossings are often in empty country: look ~6 km around, then ~20 km.
      nearestPlace(lat, lng)
        .then((n) => n ?? nearestPlace(lat, lng, 0.2))
        .catch(() => null)
        .then((name) => {
          legs[l]!.toName = name;
          legs[l + 1]!.fromName = name;
        }),
    );
  }
  await Promise.all(lookups);
  const insideKm = legs.filter((l) => l.insideHp).reduce((t, l) => t + l.distanceKm, 0);
  const entryLeg = legs.findIndex((l, i) => l.insideHp && i > 0);
  const entry = entryLeg > 0 ? legs[entryLeg]!.fromName : null;

  // Events on the HP part of this route, in driving order, with ETAs that include earlier delays.
  const line = lineString(coords);
  const usedRoads = new Set(Object.keys(r.roads).map(norm));
  const onRoute = ctx.events
    .filter((e) => booleanPointInPolygon([e.lng, e.lat], HP_BOUNDARY))
    .map((e) => ({ e, np: nearestPointOnLine(line, point([e.lng, e.lat]), { units: "kilometers" }) }))
    .filter(({ e, np }) => {
      const sameRoad = e.roadRef ? usedRoads.has(norm(e.roadRef)) : false;
      return (np.properties.dist ?? Infinity) <= (sameRoad ? NEAR_SAME_ROAD_KM : NEAR_OTHER_ROAD_KM);
    })
    .sort((a, b) => (a.np.properties.location ?? 0) - (b.np.properties.location ?? 0));
  let delaySoFar = 0;
  const events: RouteEvent[] = onRoute.map(({ e, np }, order) => {
    const segIdx = Math.min(np.properties.index ?? 0, cumS.length - 1);
    const harmless = e.type === "clear" || e.status === "open";
    const delayMin = harmless ? 0 : (DELAY_MIN[e.status] ?? 0);
    const etaAt = new Date(ctx.departAt.getTime() + (cumS[segIdx]! + delaySoFar * 60) * 1000).toISOString();
    delaySoFar += delayMin;
    return { ...e, order, alongKm: np.properties.location ?? 0, etaAt, delayMin, blocks: !harmless && e.status === "closed" };
  });

  // "via NH-3 · Pandoh · Aut": main roads by distance + HP towns the route passes, in order.
  const viaRoads = Object.entries(r.roads)
    .sort((a, b) => b[1] - a[1])
    .filter(([, m]) => m > 5000)
    .slice(0, 3)
    .map(([k]) => roadLabel(k));
  const passed = ctx.towns
    .map((t) => ({ t, np: nearestPointOnLine(line, point([t.lng, t.lat]), { units: "kilometers" }) }))
    .filter(({ t, np }) => (np.properties.dist ?? Infinity) < 1.5 && t.name !== ctx.from.name && t.name !== ctx.to.name)
    .sort((a, b) => (a.np.properties.location ?? 0) - (b.np.properties.location ?? 0))
    .map(({ t }) => t.name);
  const step = Math.max(1, Math.ceil(passed.length / 3));
  const viaTowns = passed.filter((_, i) => i % step === 0).slice(0, 3);

  const driveMin = Math.round(totalS / 60);
  const delayMin = events.reduce((t, e) => t + e.delayMin, 0);
  return {
    id: `r${idx}`,
    distanceKm: Math.round(r.distanceM / 100) / 10,
    driveMin,
    delayMin,
    totalMin: driveMin + delayMin,
    arriveAt: new Date(ctx.departAt.getTime() + (totalS + delayMin * 60) * 1000).toISOString(),
    viaRoads,
    viaTowns,
    geometry: simplify(line, { tolerance: 0.0002, highQuality: false }).geometry,
    legs,
    hp: { insideKm: Math.round(insideKm * 10) / 10, outsideKm: Math.round((r.distanceM / 1000 - insideKm) * 10) / 10, entry },
    events,
    blocked: events.some((e) => e.blocks),
  };
}

function verdictFor(o: Omit<RouteOption, "recommended" | "verdict">): CodeVerdict {
  const arrive = `Arrive ~${clock(new Date(o.arriveAt))}`;
  if (o.hp.insideKm < 0.5) {
    return { verdict: "go", pill: "Outside Himachal", headline: arrive, detail: "Pathfinder checks roads in Himachal Pradesh only" };
  }
  const prefix = o.hp.outsideKm >= 1 ? "Himachal stretch: " : "";
  const real = o.events.filter((e) => e.delayMin > 0 || e.blocks);
  if (!real.length) {
    return { verdict: "go", pill: "All clear", headline: arrive, detail: "No verified issues on this route" };
  }
  const closed = real.find((e) => e.blocks);
  if (closed) {
    return {
      verdict: "avoid",
      pill: `${prefix}Closed at ${where(closed)}`,
      headline: `Road closed at ${where(closed)}`,
      detail: "Take another route or wait for it to reopen",
    };
  }
  const delay = o.delayMin >= 20 ? "delay" : "go_with_care";
  const worst = real.find((e) => e.status === "one_lane") ?? real[0]!;
  const word = worst.status === "one_lane" ? "One lane" : worst.status === "slow" ? "Slow" : "Unclear";
  return {
    verdict: delay,
    pill: `${prefix}${word} at ${where(worst)}${real.length > 1 ? ` +${real.length - 1}` : ""}`,
    headline: arrive,
    detail: `Includes ~${o.delayMin} min delay ${real.length > 1 ? `across ${real.length} spots` : `at ${where(worst)}`}`,
  };
}

interface NhSegment {
  road_ref: string;
  geom: { coordinates: [number, number][] };
}

/**
 * Closed → reroute (7.5b). OSRM can't avoid a point, so try a via point on a nearby national
 * highway the blocked route doesn't use (e.g. Kataula closed → via NH-3 at Aut). Up to 2 tries.
 * TODO(phase-2 part B): the Route Check agent's find_alternate_routes tool builds on this.
 */
async function detoursAround(blocked: Omit<RouteOption, "recommended" | "verdict">, from: NamedPoint, to: NamedPoint): Promise<OsrmRoute[]> {
  const ev = blocked.events.find((e) => e.blocks)!;
  const line = lineString(blocked.geometry.coordinates);
  const d = 0.25; // ~25 km around the closure
  const segs = await rpc<NhSegment[]>("segments_in_bbox", { w: ev.lng - d, s: ev.lat - d, e: ev.lng + d, n: ev.lat + d }).catch(
    () => [] as NhSegment[],
  );
  // One candidate per highway: its point closest to the closure, but well away from the blocked route.
  const best = new Map<string, { lat: number; lng: number; dist: number }>();
  for (const sg of segs) {
    if (!/^NH/i.test(sg.road_ref ?? "")) continue;
    const c = sg.geom.coordinates[Math.floor(sg.geom.coordinates.length / 2)]!;
    const offRoute = nearestPointOnLine(line, point(c), { units: "kilometers" }).properties.dist ?? 0;
    if (offRoute < 3) continue;
    const dist = Math.hypot(c[0] - ev.lng, c[1] - ev.lat);
    const prev = best.get(sg.road_ref);
    if (!prev || dist < prev.dist) best.set(sg.road_ref, { lat: c[1], lng: c[0], dist });
  }
  const vias = [...best.values()].sort((a, b) => a.dist - b.dist).slice(0, 2);
  const found = await Promise.all(vias.map((v) => osrmRoutes(from, to, [v]).catch(() => [] as OsrmRoute[])));
  // Reject silly detours (> 1.7× the blocked route's length).
  return found.flat().filter((r) => r.distanceM < blocked.distanceKm * 1000 * 1.7);
}

// /route asks for the plan (GET /api/route), then for the agent (POST /api/route-check) which needs the
// same plan: keep it for 3 minutes so the second request doesn't rebuild it (~4 s on long trips).
const PLAN_TTL_MS = 3 * 60_000;
const planCache = new Map<string, { at: number; plan: RoutePlan & { degraded?: string } }>();

/** Throws only if routing itself fails (the caller degrades); events/towns degrade to empty.
 *  `fresh` skips the cache read (Road Watch must see the event that just changed) but still refills it. */
export async function planRoute(
  from: NamedPoint,
  to: NamedPoint,
  departAt: Date,
  opts: { fresh?: boolean } = {},
): Promise<RoutePlan & { degraded?: string }> {
  const key = `${[from.lat, from.lng, to.lat, to.lng].map((x) => x.toFixed(4)).join(",")}|${from.name}|${to.name}|${Math.floor(departAt.getTime() / 300_000)}`;
  const hit = planCache.get(key);
  if (hit && !opts.fresh && Date.now() - hit.at < PLAN_TTL_MS) return hit.plan;
  const plan = await buildPlan(from, to, departAt);
  if (planCache.size > 100) planCache.delete(planCache.keys().next().value!);
  if (!plan.degraded) planCache.set(key, { at: Date.now(), plan });
  return plan;
}

async function buildPlan(from: NamedPoint, to: NamedPoint, departAt: Date): Promise<RoutePlan & { degraded?: string }> {
  const raw = await osrmRoutes(from, to);
  const all = raw.flatMap((r) => r.coordinates);
  // Wide enough (~30 km) that a detour around a closure still sees the events on its roads.
  const pad = 0.3;
  const w = Math.min(...all.map((c) => c[0])) - pad;
  const e = Math.max(...all.map((c) => c[0])) + pad;
  const s = Math.min(...all.map((c) => c[1])) - pad;
  const n = Math.max(...all.map((c) => c[1])) + pad;

  let degraded: string | undefined;
  const [events, towns] = hasDb()
    ? await Promise.all([
        openEventsInBbox(w, s, e, n, 1000).catch(() => {
          degraded = "road conditions unavailable right now — showing drive time only";
          return [] as MapEvent[];
        }),
        select<TownRow>("places", `select=name,lat,lng&kind=eq.town&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}&limit=200`).catch(
          () => [] as TownRow[],
        ),
      ])
    : [[] as MapEvent[], [] as TownRow[]];
  if (!hasDb()) degraded = "road conditions unavailable (database not configured)";

  const ctx = { from, to, departAt, events, towns };
  const analysed = await Promise.all(raw.map((r, i) => analyse(r, i, ctx)));
  if (analysed.every((o) => o.blocked) && hasDb()) {
    const detours = await detoursAround(analysed[0]!, from, to);
    analysed.push(...(await Promise.all(detours.map((r, i) => analyse(r, analysed.length + i, ctx)))));
  }
  // Recommend the fastest route that isn't blocked (or the fastest overall if all are).
  const pool = analysed.some((o) => !o.blocked) ? analysed.filter((o) => !o.blocked) : analysed;
  const best = pool.reduce((a, b) => (b.totalMin < a.totalMin ? b : a));
  const routes: RouteOption[] = analysed
    .map((o) => ({ ...o, recommended: o.id === best.id, verdict: verdictFor(o) }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.totalMin - b.totalMin);

  return {
    from,
    to,
    departAt: departAt.toISOString(),
    checkedAt: new Date().toISOString(),
    routes,
    note: routes.every((r) => r.hp.insideKm < 0.5) ? "Pathfinder checks roads in Himachal Pradesh only" : null,
    timeModel: TIME_MODEL,
    ...(degraded && { degraded }),
  };
}
