// Server-only: the Command Centre's world view for one district — open events ranked by impact
// (plain code, see impact.ts), crews, and the four stat tiles. No AI here.
import { select } from "../db/supabase.ts";
import { EVENT_SELECT, toMapEvent, type EventRow } from "../events/queries.ts";
import { districtBbox, kmBetween, type District } from "./districts.ts";
import { impactOf } from "./impact.ts";
import type { CommandCentre, CrewInfo, QueueItem } from "./types.ts";

interface Row extends EventRow {
  measurements: { debrisVolumeM3?: { min: number; max: number } | null } | null;
  road_segments: { road_ref: string | null; road_name: string | null; highway: string | null } | null;
}

interface CrewRow {
  id: string;
  org: string;
  name: string;
  machines: string[] | null;
  available: boolean;
  current_event_id: string | null;
}

/** "NH3" → "NH-3"; names pass through. */
export function roadLabel(ref: string | null): string | null {
  if (!ref) return null;
  const m = /^(NH|SH|MDR)\s*-?\s*(\d+\w*)$/i.exec(ref.trim());
  return m ? `${m[1]!.toUpperCase()}-${m[2]}` : ref;
}

export async function crewsOf(d: District): Promise<CrewInfo[]> {
  const rows = await select<CrewRow>("crews", `select=id,org,name,machines,available,current_event_id&district=eq.${encodeURIComponent(d.name)}&order=name`);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    org: c.org,
    machines: c.machines ?? [],
    available: c.available,
    currentEventId: c.current_event_id,
  }));
}

export async function rankedQueue(d: District, crews: CrewInfo[], now = Date.now()): Promise<QueueItem[]> {
  const [w, s, e, n] = districtBbox(d);
  const rows = await select<Row>(
    "events",
    `select=${EVENT_SELECT.replace("road_segments(road_ref,road_name)", "road_segments(road_ref,road_name,highway)")},measurements` +
      `&resolved_at=is.null&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}&limit=200`,
  );
  const items = rows
    .filter((r) => kmBetween(r, d) <= d.radiusKm && r.type !== "clear")
    .map((r) => {
      const ev = toMapEvent(r);
      const imp = impactOf({ type: r.type, status: r.status, highway: r.road_segments?.highway ?? null, confidence: r.confidence, etaClear: r.eta_clear }, now);
      const crew = crews.find((c) => c.currentEventId === r.id);
      const item: QueueItem = {
        rank: 0,
        event: ev,
        road: roadLabel(ev.roadRef),
        vehiclesPerDay: imp.vehiclesPerDay,
        vehiclesHit: imp.vehiclesHit,
        vehicleHours: imp.vehicleHours,
        hoursLeft: imp.hoursLeft,
        etaKnown: imp.etaKnown,
        debrisM3: r.measurements?.debrisVolumeM3 ?? null,
        crew: crew ? { id: crew.id, name: crew.name, machines: crew.machines } : null,
        status: r.status,
      };
      return item;
    })
    .sort((a, b) => b.vehicleHours - a.vehicleHours || b.vehiclesHit - a.vehiclesHit);
  items.forEach((it, i) => (it.rank = i + 1));
  return items;
}

/** Active watched trips whose route box touches the district. */
async function watchingCount(d: District): Promise<number> {
  const rows = await select<{ route_cache: { bbox?: [number, number, number, number] } | null }>(
    "watched_trips",
    "select=route_cache&active=is.true&limit=1000",
  );
  const [w, s, e, n] = districtBbox(d);
  return rows.filter((r) => {
    const b = r.route_cache?.bbox;
    return b && b[0] <= e && b[2] >= w && b[1] <= n && b[3] >= s;
  }).length;
}

export async function commandCentre(official: { name: string; org: string; role: string; district: District }): Promise<CommandCentre> {
  const d = official.district;
  const crews = await crewsOf(d);
  const [queue, watching] = await Promise.all([rankedQueue(d, crews), watchingCount(d).catch(() => 0)]);
  return {
    official,
    stats: {
      active: queue.filter((q) => q.status !== "open").length,
      crewsFree: crews.filter((c) => c.available && !c.currentEventId).length,
      crewsTotal: crews.length,
      vehiclesHit: queue.reduce((sum, q) => sum + q.vehiclesHit, 0),
      watching,
    },
    queue,
    crews,
  };
}
