// Phase 0: load data/segments.geojson + data/places.json into Supabase (tables from
// supabase/migrations/0001_road_segments_places.sql). Goes over HTTPS (PostgREST, service role)
// because cloud sessions can't open raw Postgres connections. Upserts on id → safe to re-run.
// Then sanity-checks segments_in_bbox() around Mandi.
// Run: pnpm load-segments
import { readFileSync } from "node:fs";
import type { FeatureCollection, LineString } from "geojson";

const BATCH = 1000;
const MANDI_BBOX = [76.88, 31.67, 76.98, 31.75] as const; // W,S,E,N

function supabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (raw) return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  // Fallback: project ref from the pooler username ("postgres.<ref>").
  const ref = process.env.SUPABASE_DB_URL ? new URL(process.env.SUPABASE_DB_URL).username.split(".")[1] : undefined;
  if (!ref) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing (and no SUPABASE_DB_URL to derive it from)");
  return `https://${ref}.supabase.co`;
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
const base = `${supabaseUrl()}/rest/v1`;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function upsert(table: string, rows: object[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await fetch(`${base}/${table}?on_conflict=id`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    });
    if (!res.ok) throw new Error(`${table} batch ${i / BATCH}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.stdout.write(`\r${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log();
}

const ewkt = (g: LineString) => `SRID=4326;LINESTRING(${g.coordinates.map(([x, y]) => `${x} ${y}`).join(",")})`;

const segments = JSON.parse(readFileSync("data/segments.geojson", "utf8")) as FeatureCollection<LineString>;
await upsert(
  "road_segments",
  segments.features.map(({ properties: p, geometry }) => ({
    id: p!.id,
    road_ref: p!.road_ref,
    road_name: p!.road_name,
    highway: p!.highway,
    km_start: p!.km_start,
    km_end: p!.km_end,
    length_m: p!.length_m,
    geom: ewkt(geometry),
  })),
);

const places = JSON.parse(readFileSync("data/places.json", "utf8")) as object[];
await upsert("places", places);

// Sanity check: segments around Mandi town via the RPC used by GET /api/segments?bbox=
const [w, s, e, n] = MANDI_BBOX;
const res = await fetch(`${base}/rpc/segments_in_bbox?select=id,road_ref`, {
  method: "POST",
  headers,
  body: JSON.stringify({ w, s, e, n }),
});
if (!res.ok) throw new Error(`segments_in_bbox: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
const hits = (await res.json()) as { id: string; road_ref: string | null }[];
const refs = [...new Set(hits.map((h) => h.road_ref).filter(Boolean))].sort();
console.log(`segments_in_bbox(Mandi): ${hits.length} segments · refs: ${refs.join(", ") || "—"}`);

const count = await fetch(`${base}/road_segments?select=id&limit=1`, { headers: { ...headers, Prefer: "count=exact" } });
console.log(`road_segments total rows: ${count.headers.get("content-range")?.split("/")[1]}`);
