// Server-only: OSRM routing (public demo server — cache results, CLAUDE.md section 3). No AI.
// overview=full + annotations give per-segment distance/duration, so ETAs along the route are exact.
const OSRM = process.env.OSRM_URL || "https://router.project-osrm.org";
const TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; data: OsrmRoute[] }>();

export interface OsrmRoute {
  distanceM: number;
  durationS: number;
  coordinates: [number, number][]; // [lng, lat]
  /** Per-segment (between consecutive coordinates) metres + seconds. */
  segDistM: number[];
  segDurS: number[];
  /** Road ref or name → metres driven on it. */
  roads: Record<string, number>;
}

interface Raw {
  code: string;
  message?: string;
  routes: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: { annotation: { distance: number[]; duration: number[] }; steps: { ref?: string; name?: string; distance: number }[] }[];
  }[];
}

type Pt = { lat: number; lng: number };

/** from → [via…] → to. With a via point OSRM returns a single route (no alternatives). */
export async function osrmRoutes(from: Pt, to: Pt, via: Pt[] = []): Promise<OsrmRoute[]> {
  const pts = [from, ...via, to];
  const key = pts.flatMap((p) => [p.lat, p.lng]).map((x) => x.toFixed(4)).join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url =
    `${OSRM}/route/v1/driving/${pts.map((p) => `${p.lng},${p.lat}`).join(";")}` +
    `?alternatives=${via.length ? "false" : "3"}&overview=full&geometries=geojson&steps=true&annotations=duration,distance`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Pathfinder/0.1 (hackathon demo)" } });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const body = (await res.json()) as Raw;
  if (body.code !== "Ok") throw new Error(`OSRM ${body.code}: ${body.message ?? ""}`);

  const data = body.routes.map((r) => {
    const roads: Record<string, number> = {};
    for (const leg of r.legs) for (const st of leg.steps) {
      const k = (st.ref || st.name || "").split(";")[0]!.trim();
      if (k) roads[k] = (roads[k] ?? 0) + st.distance;
    }
    return {
      distanceM: r.distance,
      durationS: r.duration,
      coordinates: r.geometry.coordinates,
      segDistM: r.legs.flatMap((l) => l.annotation.distance),
      segDurS: r.legs.flatMap((l) => l.annotation.duration),
      roads,
    };
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data });
  return data;
}
