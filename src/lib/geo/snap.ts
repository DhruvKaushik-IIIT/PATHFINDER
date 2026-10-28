// Server-only: report GPS → nearest road segment (PostGIS nearest_segment RPC) + a human place name.
import { rpc, select } from "../db/supabase.ts";

export interface SnappedSegment {
  id: string;
  road_ref: string | null;
  road_name: string | null;
  km_start: number | null;
  distance_m: number;
}

export interface Snap {
  segment: SnappedSegment | null;
  placeName: string | null;
}

/** Haversine distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function nearestSegment(lat: number, lng: number): Promise<SnappedSegment | null> {
  // 300 m covers GPS error on a mountain road; 1 km catches photos taken from a viewpoint above it.
  for (const max_m of [300, 1000]) {
    const [hit] = await rpc<SnappedSegment[]>("nearest_segment", { p_lat: lat, p_lng: lng, max_m });
    if (hit) return hit;
  }
  return null;
}

interface PlaceRow {
  name: string;
  kind: string;
  lat: number;
  lng: number;
}

/** Nearest named place within ~6 km; towns win over villages unless the village is much closer. */
async function nearestPlace(lat: number, lng: number): Promise<string | null> {
  const d = 0.06;
  const rows = await select<PlaceRow>(
    "places",
    `select=name,kind,lat,lng&kind=in.(town,village,pass,tunnel)` +
      `&lat=gte.${lat - d}&lat=lte.${lat + d}&lng=gte.${lng - d}&lng=lte.${lng + d}&limit=500`,
  );
  let best: { name: string; score: number } | null = null;
  for (const p of rows) {
    const m = distanceM(lat, lng, p.lat, p.lng);
    const score = p.kind === "village" ? m * 2.5 : m; // "near Aut" beats "near some hamlet 400 m away"
    if (!best || score < best.score) best = { name: p.name, score };
  }
  return best?.name ?? null;
}

/** Never throws: a lookup failure just means "unknown road/place". */
export async function snapToRoad(lat: number, lng: number): Promise<Snap> {
  const [segment, placeName] = await Promise.all([
    nearestSegment(lat, lng).catch(() => null),
    nearestPlace(lat, lng).catch(() => null),
  ]);
  return { segment, placeName };
}
