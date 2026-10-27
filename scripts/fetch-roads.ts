// Phase 0: one-time download of Himachal Pradesh roads + state boundary from OSM (Overpass).
// Outputs:
//   data/hp-boundary.geojson      HP admin_level=4 polygon (full detail)
//   data/hp-roads.geojson         OSM ways as LineStrings (tags: highway, ref, name, surface, oneway)
//   data/segments.geojson         ~1 km segments with stable ids (what events snap to)
//   public/geo/hp-boundary.geojson   simplified boundary for the map
//   public/geo/corridor.geojson      segments in the Mandi → Sissu corridor bbox, for the Phase 0 map layer
// Prints: ways, total km, km per class, NH-3 Mandi → Manali sanity check (~110 km expected).
// Converts Overpass `out geom` itself (no osmtogeojson dependency).
// Run: pnpm fetch-roads [--cache]   (--cache reuses raw responses saved in out/overpass/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon, Position } from "geojson";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const HP_BBOX = "30.3,75.5,33.3,79.0"; // S,W,N,E fallback
const CORRIDOR_BBOX: [number, number, number, number] = [76.75, 31.55, 77.4, 32.6]; // W,S,E,N: Mandi → Sissu
const KEEP_TAGS = ["highway", "ref", "name", "surface", "oneway"] as const;
const useCache = process.argv.includes("--cache");

interface OsmWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}
interface OsmRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}

async function overpass(name: string, query: string): Promise<{ elements: unknown[] }> {
  const cachePath = `out/overpass/${name}.json`;
  if (useCache && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, "utf8"));
  console.log(`overpass: ${name} …`);
  const t0 = Date.now();
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Overpass ${name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { elements: unknown[] };
  mkdirSync("out/overpass", { recursive: true });
  writeFileSync(cachePath, JSON.stringify(json));
  console.log(`overpass: ${name} ok · ${json.elements.length} elements · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return json;
}

const pos = (g: { lat: number; lon: number }): Position => [g.lon, g.lat];
const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Join relation member ways (in any order/direction) into closed rings. */
function stitchRings(parts: Position[][]): Position[][] {
  const rings: Position[][] = [];
  const pool = parts.filter((p) => p.length > 1).map((p) => [...p]);
  while (pool.length) {
    let ring = pool.shift()!;
    let grew = true;
    while (!same(ring[0]!, ring[ring.length - 1]!) && grew) {
      grew = false;
      const end = ring[ring.length - 1]!;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]!;
        if (same(p[0]!, end)) ring = ring.concat(p.slice(1));
        else if (same(p[p.length - 1]!, end)) ring = ring.concat([...p].reverse().slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (same(ring[0]!, ring[ring.length - 1]!) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

async function fetchBoundary(): Promise<Feature<Polygon | MultiPolygon>> {
  const q = `[out:json][timeout:180];
relation["name"="Himachal Pradesh"]["admin_level"="4"]["boundary"="administrative"];
out geom;`;
  const { elements } = await overpass("hp-boundary", q);
  const rel = elements.find((e) => (e as OsmRelation).type === "relation") as OsmRelation | undefined;
  if (!rel) throw new Error("HP boundary relation not found");
  const outer = rel.members.filter((m) => m.type === "way" && m.role !== "inner" && m.geometry).map((m) => m.geometry!.map(pos));
  const rings = stitchRings(outer);
  if (!rings.length) throw new Error("could not assemble HP boundary rings");
  rings.sort((a, b) => turf.area(turf.polygon([b])) - turf.area(turf.polygon([a])));
  const props = { name: "Himachal Pradesh", osm_relation: rel.id };
  return rings.length === 1 ? turf.polygon([rings[0]!], props) : turf.multiPolygon(rings.map((r) => [r]), props);
}

async function fetchRoads(): Promise<FeatureCollection<LineString>> {
  const body = `
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](AREA);
  way["highway"~"^(unclassified|track)$"]["name"](AREA);`;
  let res: { elements: unknown[] };
  try {
    res = await overpass(
      "hp-roads",
      `[out:json][timeout:180];
area["name"="Himachal Pradesh"]["admin_level"="4"]->.hp;
(${body.replaceAll("(AREA)", "(area.hp)")}
);
out geom tags;`,
    );
    if (!res.elements.length) throw new Error("area query returned 0 ways");
  } catch (err) {
    console.log(`area query failed (${(err as Error).message}) → bbox fallback`);
    res = await overpass("hp-roads-bbox", `[out:json][timeout:180];\n(${body.replaceAll("(AREA)", `(${HP_BBOX})`)}\n);\nout geom tags;`);
  }
  const features: Feature<LineString>[] = [];
  for (const e of res.elements as OsmWay[]) {
    if (e.type !== "way" || !e.geometry || e.geometry.length < 2) continue;
    const props: Record<string, string | number> = { osm_id: e.id };
    for (const k of KEEP_TAGS) if (e.tags?.[k]) props[k] = e.tags[k]!;
    features.push(turf.lineString(e.geometry.map(pos), props));
  }
  return turf.featureCollection(features);
}

/** NH-3 appears as ref=NH3 (older name NH21); refs can be "NH3;NH154" etc. */
export function isNH3(ref: string | undefined): boolean {
  return !!ref && ref.split(/[;,]/).some((r) => /^\s*NH\s*-?\s*(3|21)\s*$/i.test(r));
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "road";
}

function roadClass(h: string): string {
  if (h === "motorway" || h === "trunk") return "national/trunk";
  if (h === "primary") return "primary (often SH)";
  if (h === "secondary") return "secondary";
  if (h === "tertiary") return "tertiary";
  return h;
}

// ---------------------------------------------------------------- main

mkdirSync("data", { recursive: true });
mkdirSync("public/geo", { recursive: true });

const boundary = await fetchBoundary();
writeFileSync("data/hp-boundary.geojson", JSON.stringify(boundary));
const boundarySimple = turf.simplify(boundary, { tolerance: 0.002, highQuality: false });
writeFileSync("public/geo/hp-boundary.geojson", JSON.stringify(boundarySimple));
console.log(`boundary: ${(turf.area(boundary) / 1e6).toFixed(0)} km² (HP official ≈ 55,673 km²)`);

const roads = await fetchRoads();
// Keep only ways that touch HP (the bbox fallback also catches neighbouring states).
roads.features = roads.features.filter((f) => turf.booleanIntersects(f, boundary));
writeFileSync("data/hp-roads.geojson", JSON.stringify(roads));

const kmByClass = new Map<string, number>();
let totalKm = 0;
const segments: Feature<LineString>[] = [];
for (const road of roads.features) {
  const p = road.properties as Record<string, string | number>;
  const len = turf.length(road, { units: "kilometers" });
  totalKm += len;
  const cls = roadClass(String(p.highway));
  kmByClass.set(cls, (kmByClass.get(cls) ?? 0) + len);

  const simple = turf.simplify(road, { tolerance: 0.0001, highQuality: false });
  const base = slug(String(p.ref ?? p.name ?? "way"));
  turf.lineChunk(simple, 1, { units: "kilometers" }).features.forEach((chunk, i) => {
    const lengthM = Math.round(turf.length(chunk, { units: "kilometers" }) * 1000);
    // Stable id: road ref/name + OSM way + chunk index. Road-level km markers need way
    // ordering along the whole road — TODO(phase-1) if snapping needs real km posts.
    chunk.properties = {
      id: `${base}-${p.osm_id}-${i}`,
      road_ref: p.ref ?? null,
      road_name: p.name ?? null,
      highway: p.highway,
      km_start: i,
      km_end: i + lengthM / 1000,
      length_m: lengthM,
    };
    segments.push(chunk);
  });
}
const segFc = turf.featureCollection(segments);
writeFileSync("data/segments.geojson", JSON.stringify(segFc));

const corridorPoly = turf.bboxPolygon(CORRIDOR_BBOX);
const corridor = turf.featureCollection(
  segments.filter((s) => {
    const h = String(s.properties?.highway);
    return ["motorway", "trunk", "primary", "secondary"].includes(h) && turf.booleanIntersects(s, corridorPoly);
  }),
);
writeFileSync("public/geo/corridor.geojson", JSON.stringify(corridor));

// NH-3 sanity check: Mandi (31.708) → Manali (32.243), by latitude band inside the corridor.
const nh3Km = roads.features
  .filter((f) => isNH3(String(f.properties?.ref ?? "")))
  .map((f) => turf.bboxClip(f, [76.85, 31.69, 77.3, 32.26]))
  .reduce((t, f) => t + (f.geometry.coordinates.length > 1 ? turf.length(f, { units: "kilometers" }) : 0), 0);

const mb = (p: string) => (readFileSync(p).length / 1048576).toFixed(1);
console.log(`\nways: ${roads.features.length}`);
console.log(`total: ${totalKm.toFixed(0)} km`);
for (const [cls, km] of [...kmByClass].sort((a, b) => b[1] - a[1])) console.log(`  ${cls.padEnd(22)} ${km.toFixed(0)} km`);
console.log(`segments: ${segments.length} (data/segments.geojson ${mb("data/segments.geojson")} MB, limit 15 MB)`);
console.log(`corridor layer: ${corridor.features.length} segments (public/geo/corridor.geojson ${mb("public/geo/corridor.geojson")} MB)`);
console.log(`NH-3 Mandi → Manali: ${nh3Km.toFixed(0)} km of road (expect ~110; dual carriageways count twice)`);
