// Server-only: place search = our HP places (treks, passes, villages Photon misses) + Photon
// (all of India, biased to Himachal) — CLAUDE.md section 3. No AI. Cached in memory.
import { select } from "../db/supabase.ts";
import type { Place } from "./placeTypes.ts";
import { distanceM } from "./snap.ts";

const PHOTON = "https://photon.komoot.io/api/";
const TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; data: Place[] }>();

const KIND_WORD: Record<string, string> = { town: "Town", village: "Village", pass: "Pass", trek: "Trek", tunnel: "Tunnel" };
const KIND_RANK: Record<string, number> = { town: 0, pass: 1, tunnel: 1, trek: 2, village: 3 };

interface PlaceRow {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
}

async function ours(q: string): Promise<Place[]> {
  // PostgREST ilike: `*` is the wildcard. Prefix matches first, then "contains".
  const safe = q.replace(/[*,()]/g, " ").trim();
  const [prefix, contains] = await Promise.all([
    select<PlaceRow>("places", `select=id,name,kind,lat,lng&name=ilike.${encodeURIComponent(safe)}*&limit=40`),
    safe.length >= 3
      ? select<PlaceRow>("places", `select=id,name,kind,lat,lng&name=ilike.*${encodeURIComponent(safe)}*&limit=20`)
      : Promise.resolve([] as PlaceRow[]),
  ]);
  const seen = new Set<string>();
  const kept: PlaceRow[] = [];
  return [...prefix, ...contains]
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    // Curated + OSM copies of the same place (same name within 3 km) → one row.
    .filter((r) => {
      const dup = kept.some((k) => k.name.toLowerCase() === r.name.toLowerCase() && distanceM(k.lat, k.lng, r.lat, r.lng) < 3000);
      if (!dup) kept.push(r);
      return !dup;
    })
    .sort((a, b) => {
      const exact = Number(b.name.toLowerCase() === safe.toLowerCase()) - Number(a.name.toLowerCase() === safe.toLowerCase());
      return exact || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || a.name.length - b.name.length;
    })
    .slice(0, 6)
    .map((r) => ({
      id: `pf:${r.id}`,
      name: r.name,
      subtitle: `${KIND_WORD[r.kind] ?? "Place"} · Himachal Pradesh`,
      lat: r.lat,
      lng: r.lng,
      source: "pathfinder" as const,
    }));
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_id: number; osm_type: string; osm_key: string; osm_value: string; name?: string; city?: string; county?: string; state?: string; country?: string; type?: string };
}

async function photon(q: string): Promise<Place[]> {
  // All of India (bbox), biased towards Himachal (lat/lon) — so "Delhi", "Chandigarh" work too.
  const url = `${PHOTON}?q=${encodeURIComponent(q)}&lat=31.7&lon=76.9&bbox=68,6,98,37&limit=8&lang=en`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Pathfinder/0.1 (hackathon demo)" } });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = (await res.json()) as { features: PhotonFeature[] };
  return body.features
    .filter((f) => f.properties.name && f.properties.country === "India" && f.properties.osm_key !== "boundary")
    .map((f) => {
      const p = f.properties;
      const kind = p.osm_value === "yes" ? "place" : p.osm_value.replace(/_/g, " ");
      const where = [p.city !== p.name ? p.city : null, p.state].filter(Boolean).join(", ");
      return {
        id: `ph:${p.osm_type}${p.osm_id}`,
        name: p.name!,
        subtitle: `${kind[0]!.toUpperCase()}${kind.slice(1)}${where ? ` · ${where}` : ""}`,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        source: "photon" as const,
      };
    });
}

/** Never throws: if one source is down, the other still answers. */
export async function searchPlaces(query: string): Promise<{ places: Place[]; degraded?: string }> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2) return { places: [] };
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { places: hit.data };

  const [a, b] = await Promise.allSettled([ours(q), photon(q)]);
  const mine = a.status === "fulfilled" ? a.value : [];
  const theirs = b.status === "fulfilled" ? b.value : [];
  // Same place from both sources (same name within 3 km) → keep ours (it's what events attach to).
  const merged = [...mine];
  for (const p of theirs) {
    const dup = merged.some((m) => m.name.toLowerCase() === p.name.toLowerCase() && distanceM(m.lat, m.lng, p.lat, p.lng) < 3000);
    if (!dup) merged.push(p);
  }
  // Exact name matches float up; otherwise ours first, then Photon (already ranked by relevance).
  const places = merged
    .map((p, i) => ({ p, i, exact: p.name.toLowerCase() === key }))
    .sort((x, y) => Number(y.exact) - Number(x.exact) || x.i - y.i)
    .map((x) => x.p)
    .slice(0, 8);

  const degraded = a.status === "rejected" && b.status === "rejected" ? "place search unavailable" : undefined;
  if (!degraded) {
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), data: places });
  }
  return { places, degraded };
}
