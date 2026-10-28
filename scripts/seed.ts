// Phase 1: demo world state along the Mandi → Aut → Kullu → Manali → Atal Tunnel → Sissu corridor
// (+ Kataula, Jalori, Triund, Darlaghat). No AI calls — hand-written events, clearly is_demo=true.
// Each event is placed ON the nearest segment of the intended road (from data/segments.geojson), so
// it snaps the same way a real report would. Fixed ids → re-running updates instead of duplicating.
// Run: pnpm seed            (upsert demo events + timelines)
//      pnpm seed --wipe     (delete ALL is_demo rows: events, timelines, reports, photos, claims, news, trips, alerts, users)
// Also upserts demo road crews (Phase 4). The "PWD Mandi (demo)" sign-in is `pnpm create-official`
// (it needs Supabase Auth); `--wipe` deletes its users row too → re-run create-official after a wipe.
import { readFileSync } from "node:fs";
import type { FeatureCollection, LineString } from "geojson";
import { hasDb, supabaseUrl } from "../src/lib/db/supabase.ts";

type Status = "open" | "slow" | "one_lane" | "closed" | "unknown";
type R = { min: number; max: number };

interface Seed {
  n: number;
  near: [number, number]; // lat, lng of the place
  road?: RegExp; // prefer segments whose ref/name matches
  place: string;
  type: string;
  status: Status;
  passable: { bike: boolean | null; car: boolean | null; bus: boolean | null };
  measurements?: { blockedLengthM?: R | null; roadWidthLeftM?: R | null; blockedPct?: R | null; vehiclesVisible?: number | null };
  etaH?: [number, number]; // clears in N–M hours from now
  summary: string;
  summaryHi: string;
  confidence: number;
  startedH: number; // hours ago
  confirmedMin: number; // last confirmed, minutes ago
  reports: number;
  official?: number;
  news?: number;
  modelsAgreed?: number;
  timeline: { minAgo: number; kind: "report" | "official" | "news" | "ai"; text: string; actor: string }[];
}

const NH3 = /^NH ?3$|^NH ?21$|Manali-Leh/i;

const SEEDS: Seed[] = [
  {
    n: 1, near: [31.7427, 77.2084], road: NH3, place: "Aut", type: "landslide", status: "one_lane",
    passable: { bike: true, car: true, bus: false },
    measurements: { blockedLengthM: { min: 30, max: 40 }, roadWidthLeftM: { min: 2.6, max: 3.2 }, blockedPct: { min: 55, max: 65 }, vehiclesVisible: 6 },
    etaH: [3, 5], summary: "Landslide near Aut: one lane open, buses held, JCB clearing debris.",
    summaryHi: "औट के पास भूस्खलन: एक लेन खुली है, बसें रोकी गई हैं, जेसीबी मलबा हटा रही है।",
    confidence: 0.86, startedH: 9, confirmedMin: 12, reports: 9, official: 1, modelsAgreed: 2,
    timeline: [
      { minAgo: 540, kind: "report", text: "Reported: boulders and debris across NH-3 near Aut, road closed.", actor: "Traveller" },
      { minAgo: 400, kind: "official", text: "PWD crew on site with 1 JCB.", actor: "PWD Mandi (demo)" },
      { minAgo: 95, kind: "report", text: "Confirmed: one lane opened, cars passing slowly.", actor: "Traveller" },
      { minAgo: 12, kind: "report", text: "Confirmed: one lane, ~35 m of debris still on the valley side.", actor: "Traveller" },
    ],
  },
  {
    n: 2, near: [31.679, 77.047], road: NH3, place: "Pandoh", type: "traffic", status: "slow",
    passable: { bike: true, car: true, bus: true },
    summary: "Slow traffic at Pandoh dam stretch — tourist rush and narrow section.",
    summaryHi: "पंडोह डैम के पास धीमा ट्रैफिक — पर्यटकों की भीड़ और संकरा हिस्सा।",
    confidence: 0.72, startedH: 3, confirmedMin: 25, reports: 3, modelsAgreed: 2,
    timeline: [{ minAgo: 25, kind: "report", text: "Reported: queue of ~1 km at Pandoh, moving slowly.", actor: "Traveller" }],
  },
  {
    n: 3, near: [31.798, 77.018], place: "Kataula", type: "landslide", status: "closed",
    passable: { bike: false, car: false, bus: false },
    measurements: { blockedLengthM: { min: 60, max: 90 }, roadWidthLeftM: { min: 0, max: 0 }, blockedPct: { min: 100, max: 100 } },
    etaH: [18, 30], summary: "Kataula road closed by a large slide — use NH-3 via Pandoh instead.",
    summaryHi: "कटौला मार्ग बड़े भूस्खलन से बंद — पंडोह होकर NH-3 से जाएँ।",
    confidence: 0.91, startedH: 20, confirmedMin: 40, reports: 5, official: 1, news: 1, modelsAgreed: 2,
    timeline: [
      { minAgo: 1200, kind: "news", text: "News: slide blocks Mandi–Kataula road after heavy rain.", actor: "Search grounding" },
      { minAgo: 600, kind: "official", text: "Road closed; clearing will take more than a day.", actor: "PWD Mandi (demo)" },
      { minAgo: 40, kind: "report", text: "Confirmed: still fully blocked.", actor: "Traveller" },
    ],
  },
  {
    n: 4, near: [31.834, 77.171], road: NH3, place: "Jhiri", type: "road_damage", status: "slow",
    passable: { bike: true, car: true, bus: true },
    summary: "Sunken patch and potholes near Jhiri — drive slowly, one side uneven.",
    summaryHi: "झिड़ी के पास सड़क धंसी है और गड्ढे हैं — धीरे चलें।",
    confidence: 0.68, startedH: 50, confirmedMin: 180, reports: 2, modelsAgreed: 2,
    timeline: [{ minAgo: 180, kind: "report", text: "Reported: road surface sinking on the river side.", actor: "Traveller" }],
  },
  {
    n: 5, near: [32.316, 77.157], place: "Solang", type: "snow", status: "slow",
    passable: { bike: false, car: true, bus: false },
    summary: "Snow on the Solang road — 4x4 or chains advised, buses stop at Burwa.",
    summaryHi: "सोलंग सड़क पर बर्फ — 4x4 या चेन लगाएँ, बसें बुरुआ तक।",
    confidence: 0.8, startedH: 14, confirmedMin: 35, reports: 4, modelsAgreed: 2,
    timeline: [{ minAgo: 35, kind: "report", text: "Confirmed: packed snow after Palchan, cars with chains passing.", actor: "Traveller" }],
  },
  {
    n: 6, near: [32.364, 77.133], road: NH3, place: "Atal Tunnel (South Portal)", type: "snow", status: "one_lane",
    passable: { bike: false, car: true, bus: false },
    measurements: { roadWidthLeftM: { min: 3, max: 3.8 } },
    etaH: [4, 8], summary: "Fresh snow at Atal Tunnel south portal — one lane cleared, 4x4 only.",
    summaryHi: "अटल टनल दक्षिण पोर्टल पर ताज़ी बर्फ — एक लेन साफ़, केवल 4x4।",
    confidence: 0.84, startedH: 7, confirmedMin: 20, reports: 6, official: 1, modelsAgreed: 2,
    timeline: [
      { minAgo: 420, kind: "news", text: "News: fresh snowfall at Atal Tunnel, traffic regulated.", actor: "Search grounding" },
      { minAgo: 120, kind: "official", text: "BRO snow cutter cleared one lane.", actor: "BRO (demo)" },
      { minAgo: 20, kind: "report", text: "Confirmed: one lane, icy near the portal.", actor: "Traveller" },
    ],
  },
  {
    n: 7, near: [32.469, 77.132], road: NH3, place: "Sissu", type: "ice", status: "slow",
    passable: { bike: false, car: true, bus: true },
    summary: "Black ice on the Sissu stretch in the morning — drive after 10 AM.",
    summaryHi: "सिस्सू के पास सुबह सड़क पर काली बर्फ — 10 बजे के बाद चलें।",
    confidence: 0.7, startedH: 16, confirmedMin: 90, reports: 2, modelsAgreed: 1,
    timeline: [{ minAgo: 90, kind: "report", text: "Reported: icy patches after the tunnel north portal.", actor: "Traveller" }],
  },
  {
    n: 8, near: [32.371, 77.246], place: "Rohtang Pass", type: "closure_notice", status: "closed",
    passable: { bike: false, car: false, bus: false },
    summary: "Rohtang Pass closed to traffic for the season — use Atal Tunnel.",
    summaryHi: "रोहतांग दर्रा मौसम के लिए बंद — अटल टनल से जाएँ।",
    confidence: 0.95, startedH: 72, confirmedMin: 300, reports: 0, official: 1, news: 2,
    timeline: [{ minAgo: 4300, kind: "official", text: "Closure notice: Rohtang closed until spring.", actor: "SDM Manali (demo)" }],
  },
  {
    n: 9, near: [31.537, 77.373], place: "Jalori Pass", type: "snow", status: "closed",
    passable: { bike: false, car: false, bus: false },
    summary: "Jalori Pass blocked by snow — no vehicles beyond Shoja.",
    summaryHi: "जलोड़ी दर्रा बर्फ से बंद — शोजा के आगे वाहन नहीं।",
    confidence: 0.82, startedH: 30, confirmedMin: 240, reports: 2, news: 1, modelsAgreed: 2,
    timeline: [{ minAgo: 240, kind: "report", text: "Reported: knee-deep snow, cars turning back at Shoja.", actor: "Traveller" }],
  },
  {
    n: 10, near: [32.255, 76.326], place: "Triund trailhead", type: "clear", status: "open",
    passable: { bike: true, car: true, bus: true },
    summary: "Triund trail and Galu road clear — good conditions for the trek.",
    summaryHi: "त्रिउंड ट्रेल और गालू सड़क साफ़ — ट्रेक के लिए अच्छे हालात।",
    confidence: 0.77, startedH: 5, confirmedMin: 60, reports: 3, modelsAgreed: 2,
    timeline: [{ minAgo: 60, kind: "report", text: "Confirmed: trail dry, road open up to Galu.", actor: "Traveller" }],
  },
  {
    n: 11, near: [31.279, 76.96], road: /^NH ?205$/, place: "Darlaghat", type: "flood_water", status: "slow",
    passable: { bike: false, car: true, bus: true },
    summary: "Water on the road after a cloudburst near Darlaghat — flood risk, avoid if possible.",
    summaryHi: "दाड़लाघाट के पास बादल फटने के बाद सड़क पर पानी — बाढ़ का खतरा, हो सके तो टालें।",
    confidence: 0.64, startedH: 4, confirmedMin: 50, reports: 2, news: 1, modelsAgreed: 1,
    timeline: [{ minAgo: 50, kind: "report", text: "Reported (voice note): cloudburst near Darlaghat, flood danger.", actor: "Traveller" }],
  },
];

// ---------------------------------------------------------------- helpers

if (!hasDb()) throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
const base = `${supabaseUrl()}/rest/v1`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function req(method: string, path: string, body?: unknown, prefer?: string): Promise<void> {
  const res = await fetch(`${base}/${path}`, {
    method,
    headers: { ...headers, ...(prefer && { Prefer: prefer }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const fromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

// ---------------------------------------------------------------- wipe

if (process.argv.includes("--wipe")) {
  // Children first; events cascade to their timeline.
  for (const t of ["alerts", "scout_requests", "watched_trips", "news_items", "official_updates", "crews", "claims", "photos", "reports", "event_timeline", "events", "users"]) {
    await req("DELETE", `${t}?is_demo=eq.true`);
    console.log(`wiped demo rows from ${t}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- place each event on its road

const segs = JSON.parse(readFileSync("data/segments.geojson", "utf8")) as FeatureCollection<LineString>;

function placeOnRoad(lat: number, lng: number, road?: RegExp) {
  let best: { segId: string; lat: number; lng: number; d: number } | null = null;
  const kx = Math.cos((lat * Math.PI) / 180); // degrees of longitude are shorter up here
  for (const f of segs.features) {
    const p = f.properties as { id: string; road_ref: string | null; road_name: string | null };
    if (road && !road.test(p.road_ref ?? "") && !road.test(p.road_name ?? "")) continue;
    for (const [x, y] of f.geometry.coordinates) {
      const d = Math.hypot((x! - lng) * kx, y! - lat);
      if (!best || d < best.d) best = { segId: p.id, lat: y!, lng: x!, d };
    }
  }
  return best;
}

const events: object[] = [];
const timeline: object[] = [];
for (const s of SEEDS) {
  const at = placeOnRoad(s.near[0], s.near[1], s.road) ?? placeOnRoad(s.near[0], s.near[1]);
  if (!at) throw new Error(`no segment near ${s.place}`);
  const km = at.d * 111;
  console.log(`${s.place.padEnd(28)} → ${at.segId} (${km.toFixed(2)} km from the place point)`);
  events.push({
    id: id(s.n),
    segment_id: at.segId,
    type: s.type,
    status: s.status,
    place_name: s.place,
    lat: at.lat,
    lng: at.lng,
    passable: s.passable,
    measurements: s.measurements ?? {},
    eta_clear: s.etaH ? { earliest: fromNow(s.etaH[0]), latest: fromNow(s.etaH[1]) } : null,
    summary: s.summary,
    summary_hi: s.summaryHi,
    confidence: s.confidence,
    started_at: ago(s.startedH * 60),
    last_confirmed_at: ago(s.confirmedMin),
    resolved_at: null,
    sources: { reports: s.reports, official: s.official ?? 0, news: s.news ?? 0, notices: 0 },
    models_agreed: s.modelsAgreed ?? null,
    is_demo: true,
  });
  for (const t of s.timeline) {
    timeline.push({ event_id: id(s.n), at: ago(t.minAgo), kind: t.kind, text: t.text, actor: t.actor, data: { seed: true }, is_demo: true });
  }
}

await req("POST", "events?on_conflict=id", events, "resolution=merge-duplicates,return=minimal");
// Timelines: replace this seed's items (re-running must not duplicate them).
await req("DELETE", `event_timeline?event_id=in.(${SEEDS.map((s) => id(s.n)).join(",")})`);
await req("POST", "event_timeline", timeline, "return=minimal");
// Demo field updates / official progress photos on seed events would contradict the reset state.
const seedIds = SEEDS.map((s) => id(s.n)).join(",");
await req("DELETE", `official_updates?event_id=in.(${seedIds})&is_demo=eq.true`);
await req("DELETE", `photos?event_id=in.(${seedIds})&source=eq.official&is_demo=eq.true`);
console.log(`\nseeded ${events.length} demo events + ${timeline.length} timeline items (is_demo=true)`);

// ---------------------------------------------------------------- crews (Command Centre)

const crewId = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const crews = [
  { id: crewId(1), org: "PWD Mandi (demo)", district: "Mandi", name: "Crew A", machines: ["JCB", "JCB"], available: false, current_event_id: id(1) },
  { id: crewId(2), org: "PWD Mandi (demo)", district: "Mandi", name: "Crew B", machines: ["JCB", "Tipper"], available: true, current_event_id: null },
  { id: crewId(3), org: "PWD Mandi (demo)", district: "Mandi", name: "Crew C", machines: ["Excavator"], available: true, current_event_id: null },
  { id: crewId(4), org: "PWD Mandi (demo)", district: "Mandi", name: "Crew D", machines: ["JCB"], available: true, current_event_id: null },
  { id: crewId(5), org: "BRO (demo)", district: "Lahaul-Spiti", name: "Snow cutter 1", machines: ["Snow cutter"], available: false, current_event_id: id(6) },
].map((c) => ({ ...c, is_demo: true }));
await req("POST", "crews?on_conflict=id", crews, "resolution=merge-duplicates,return=minimal");
console.log(`seeded ${crews.length} demo crews`);

// ---------------------------------------------------------------- demo scouts (Mandi leaderboard on /me)

const scoutId = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const scouts = [
  { id: scoutId(1), display_name: "Rakesh T.", points: 1240 },
  { id: scoutId(2), display_name: "Neha S.", points: 980 },
  { id: scoutId(3), display_name: "Arjun K.", points: 865 },
  { id: scoutId(4), display_name: "Pooja R.", points: 410 },
].map((u) => ({ ...u, role: "public", district: "Mandi", is_demo: true }));
await req("POST", "users?on_conflict=id", scouts, "resolution=merge-duplicates,return=minimal");
console.log(`seeded ${scouts.length} demo scouts (Mandi leaderboard)`);
