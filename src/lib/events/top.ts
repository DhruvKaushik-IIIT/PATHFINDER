// Server-only: "Across Himachal right now" — the 10 open incidents/closures that matter most
// across the whole state. Plain code, no AI (free to load on every Home visit).
//
// Ranking, in priority order (Dhruv, Nov 1):
//  1. REACH — how many people it touches: traffic on that road class (≈ how many routes run through
//     it), closeness to the places most travellers go / most people live (hubs below), and how many
//     Pathfinder users are watching a trip through it right now. This dominates the score.
//  2. DAMAGE — status (closed > one lane > slow) plus how big it is (debris volume, % of road blocked).
//     It only re-orders events with similar reach.
// Confidence scales the whole thing a little so a shaky news-only report can't top the list.
import { select } from "../db/supabase.ts";
import { dataVersion } from "./version.ts";
import { distanceM } from "../geo/snap.ts";
import { vehiclesPerDayOf } from "../official/impact.ts";
import { roadLabel } from "../official/queue.ts";
import { EVENT_SELECT, toMapEvent, type EventRow } from "./queries.ts";
import type { EventStatus, TopItem, TopResult } from "./types.ts";

/** Himachal Pradesh bbox (CLAUDE.md 7.6). */
const HP: [number, number, number, number] = [75.5, 30.3, 79.0, 33.3];

/**
 * Where most travellers go / most people live. Weight 0..1 is a rough relative estimate (tourist
 * footfall + population + gateway role), not an official statistic — the UI says "est.".
 */
const HUBS: { name: string; lat: number; lng: number; w: number }[] = [
  { name: "Manali", lat: 32.243, lng: 77.189, w: 1 },
  { name: "Shimla", lat: 31.104, lng: 77.173, w: 1 },
  { name: "Dharamshala", lat: 32.219, lng: 76.323, w: 0.8 },
  { name: "Kullu", lat: 31.957, lng: 77.109, w: 0.7 },
  { name: "Atal Tunnel", lat: 32.364, lng: 77.15, w: 0.7 },
  { name: "Parwanoo", lat: 30.838, lng: 76.961, w: 0.55 }, // main gateway from Chandigarh / Delhi
  { name: "Mandi", lat: 31.708, lng: 76.932, w: 0.5 }, // junction of NH-3 / NH-154 / NH-205
  { name: "Kasol", lat: 32.01, lng: 77.315, w: 0.5 },
  { name: "Solan", lat: 30.905, lng: 77.097, w: 0.45 },
  { name: "Dalhousie", lat: 32.536, lng: 75.971, w: 0.45 },
  { name: "Narkanda", lat: 31.257, lng: 77.46, w: 0.35 },
  { name: "Kaza", lat: 32.227, lng: 78.072, w: 0.35 },
  { name: "Bir", lat: 32.044, lng: 76.723, w: 0.3 },
  { name: "Palampur", lat: 32.11, lng: 76.537, w: 0.3 },
  { name: "Kasauli", lat: 30.9, lng: 76.965, w: 0.3 },
  { name: "Bilaspur", lat: 31.333, lng: 76.757, w: 0.3 },
  { name: "Reckong Peo", lat: 31.538, lng: 78.27, w: 0.3 },
  { name: "Chamba", lat: 32.556, lng: 76.126, w: 0.3 },
  { name: "Jibhi", lat: 31.588, lng: 77.36, w: 0.25 },
  { name: "Hamirpur", lat: 31.684, lng: 76.522, w: 0.25 },
  { name: "Una", lat: 31.468, lng: 76.27, w: 0.25 },
  { name: "Nahan", lat: 30.56, lng: 77.295, w: 0.2 },
];

const STATUS_SEV: Record<EventStatus, number> = { closed: 1, one_lane: 0.65, slow: 0.4, unknown: 0.3, open: 0 };

interface Row extends EventRow {
  road_segments: { road_ref: string | null; road_name: string | null; highway: string | null } | null;
  measurements: {
    roadWidthLeftM?: { min: number; max: number } | null;
    debrisVolumeM3?: { min: number; max: number } | null;
    blockedPct?: { min: number; max: number } | null;
  } | null;
}

/** 0..1 — how close it is to the places people go (combined, so a spot between two hubs counts more). */
export function hubReach(lat: number, lng: number): { score: number; hub: string | null; km: number } {
  let miss = 1;
  let best: { hub: string | null; km: number; v: number } = { hub: null, km: Infinity, v: 0 };
  for (const h of HUBS) {
    const km = distanceM(lat, lng, h.lat, h.lng) / 1000;
    const v = h.w * Math.exp(-km / 15); // 15 km away counts ~⅓
    miss *= 1 - v;
    if (v > best.v) best = { hub: h.name, km, v };
  }
  return { score: 1 - miss, hub: best.hub, km: best.km };
}

/** 0..~1.25 — status first, then size of the damage. */
export function damageOf(status: EventStatus, m: Row["measurements"]): number {
  let d = STATUS_SEV[status];
  const vol = m?.debrisVolumeM3?.max ?? 0;
  if (vol >= 500) d += 0.15;
  else if (vol >= 100) d += 0.08;
  if ((m?.blockedPct?.min ?? 0) >= 90) d += 0.1;
  return d;
}

/** The ranking score. Reach varies ~10×, damage only ~2× → reach decides, damage breaks near-ties. */
export function topScore(reach: number, damage: number, confidence: number): number {
  return reach * (0.5 + 0.5 * damage) * (0.6 + 0.4 * confidence);
}

const TTL_MS = 2 * 60_000;
let cache: { at: number; v: string; data: TopResult } | null = null;

/** Throws only on database errors (the API route degrades). */
export async function topAcrossHimachal(limit = 10, now = Date.now()): Promise<TopResult> {
  const v = await dataVersion().catch(() => "");
  if (cache && cache.v === v && now - cache.at < TTL_MS) return { ...cache.data, items: cache.data.items.slice(0, limit) };
  const [w, s, e, n] = HP;
  const [rows, trips] = await Promise.all([
    select<Row>(
      "events",
      `select=${EVENT_SELECT.replace("road_segments(road_ref,road_name)", "road_segments(road_ref,road_name,highway)")}` +
        `&resolved_at=is.null&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}&limit=500`,
    ),
    // Who is watching a trip through each event (precise: listed in the trip's snapshot).
    select<{ route_cache: { events?: { id: string }[] } | null }>("watched_trips", "select=route_cache&active=is.true&limit=2000").catch(() => []),
  ]);
  const watching = new Map<string, number>();
  for (const t of trips) for (const x of t.route_cache?.events ?? []) watching.set(x.id, (watching.get(x.id) ?? 0) + 1);

  const live = rows.filter((r) => r.type !== "clear" && r.status !== "open");
  const counts = { closed: 0, oneLane: 0, slow: 0, other: 0 };
  for (const r of live) {
    if (r.status === "closed") counts.closed++;
    else if (r.status === "one_lane") counts.oneLane++;
    else if (r.status === "slow") counts.slow++;
    else counts.other++;
  }

  const items: TopItem[] = live
    .map((r) => {
      const ev = toMapEvent(r);
      const vpd = vehiclesPerDayOf(r.road_segments?.highway);
      const hub = hubReach(r.lat, r.lng);
      const watchers = watching.get(r.id) ?? 0;
      const traffic = Math.min(1.5, vpd / 6000);
      const reach = 0.45 * traffic + 0.4 * hub.score + 0.15 * Math.min(1, watchers / 5);
      const damage = damageOf(r.status, r.measurements);
      const road = roadLabel(ev.roadRef);
      const why: string[] = [];
      why.push(`${road ? `${road} · ` : ""}~${vpd >= 1000 ? `${Math.round(vpd / 100) / 10}k` : vpd} vehicles/day`);
      if (hub.hub && hub.km <= 40) why.push(hub.km < 5 ? `In ${hub.hub}` : `~${Math.round(hub.km)} km from ${hub.hub}`);
      if (watchers) why.push(`${watchers} watching`);
      return {
        ...ev,
        rank: 0,
        score: Math.round(topScore(reach, damage, r.confidence) * 1000) / 1000,
        road,
        vehiclesPerDay: vpd,
        nearHub: hub.km <= 40 ? hub.hub : null,
        watchers,
        why,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x, i) => ({ ...x, rank: i + 1 }));

  const data: TopResult = { items, counts, total: live.length, checkedAt: new Date(now).toISOString() };
  cache = { at: now, v, data };
  return { ...data, items: items.slice(0, limit) };
}
