// Phase 0: every named place in Himachal Pradesh from OSM (Overpass) → data/places.json.
// Pulls cities/towns/villages/hamlets/suburbs, mountain passes, named tunnels and hiking routes,
// keeps those inside data/hp-boundary.geojson, then merges data/places-curated.json (hand-checked
// demo places; they win over OSM duplicates within 2 km with the same name).
// Overpass blocks cloud containers → run on the Mac, commit data/places.json, then `pnpm load-segments`.
// Run: pnpm fetch-places [--cache]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const useCache = process.argv.includes("--cache");

type Kind = "town" | "pass" | "trek" | "tunnel" | "village";
interface Place { id: string; name: string; kind: Kind; lat: number; lng: number }
interface OsmEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const query = `[out:json][timeout:240];
area["name"="Himachal Pradesh"]["admin_level"="4"]->.hp;
(
  node["place"~"^(city|town|village|hamlet|suburb)$"]["name"](area.hp);
  node["mountain_pass"="yes"]["name"](area.hp);
  way["tunnel"="yes"]["highway"]["name"](area.hp);
  relation["route"="hiking"]["name"](area.hp);
);
out center tags;`;

async function overpass(): Promise<{ elements: OsmEl[] }> {
  const cachePath = "out/overpass/hp-places.json";
  if (useCache && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, "utf8"));
  console.log("overpass: hp-places …");
  const res = await fetch(OVERPASS, {
    method: "POST",
    // Overpass returns 406 to requests without an identifying User-Agent.
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Pathfinder/0.1 (+https://github.com/DhruvKaushik-IIIT/PATHFINDER)",
      Accept: "application/json",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Overpass hp-places: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { elements: OsmEl[] };
  mkdirSync("out/overpass", { recursive: true });
  writeFileSync(cachePath, JSON.stringify(json));
  return json;
}

function kindOf(t: Record<string, string>): Kind | null {
  if (t.place === "city" || t.place === "town") return "town";
  if (t.place) return "village"; // village, hamlet, suburb
  if (t.mountain_pass === "yes") return "pass";
  if (t.tunnel === "yes") return "tunnel";
  if (t.route === "hiking") return "trek";
  return null;
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const round = (n: number) => Math.round(n * 1e5) / 1e5;

const boundary = JSON.parse(readFileSync("data/hp-boundary.geojson", "utf8")) as Feature<Polygon | MultiPolygon>;
const curated = JSON.parse(readFileSync("data/places-curated.json", "utf8")) as Place[];

const { elements } = await overpass();
const osm: Place[] = [];
const seenTunnel = new Set<string>(); // a tunnel is often several ways with the same name
for (const el of elements) {
  const t = el.tags ?? {};
  const kind = kindOf(t);
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const name = t["name:en"] ?? t.name;
  if (!kind || lat == null || lng == null || !name) continue;
  if (!turf.booleanPointInPolygon([lng, lat], boundary)) continue;
  if (kind === "tunnel") {
    if (seenTunnel.has(name)) continue;
    seenTunnel.add(name);
  }
  osm.push({ id: `${slug(name) || "place"}-${el.type[0]}${el.id}`, name, kind, lat: round(lat), lng: round(lng) });
}

const isDup = (p: Place) =>
  curated.some((c) => slug(c.name) === slug(p.name) && turf.distance([c.lng, c.lat], [p.lng, p.lat]) < 2);
const places = [...curated, ...osm.filter((p) => !isDup(p))];
writeFileSync("data/places.json", JSON.stringify(places, null, 0).replace(/},{/g, "},\n{"));

const byKind = places.reduce<Record<string, number>>((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
console.log(`places: ${places.length} (${curated.length} curated + ${places.length - curated.length} OSM) ·`, byKind);
