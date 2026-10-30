// Server-only: Risk Forecast v1 (CLAUDE.md Phase 3 task 5). Plain code, no AI:
// Open-Meteo hourly rain/snow at points along a route (at the time you'd be there) or on a grid
// around a place, × landslides/road damage seen nearby in the last 90 days → none/low/moderate/high.
// Optional "replay" swaps the live forecast for a real past day saved by scripts/fetch-weather-replay.ts
// (labelled as a replay in the UI) so the banner can be demoed on a dry day.
import { along, booleanPointInPolygon, buffer, length, lineSliceAlong, lineString } from "@turf/turf";
import { existsSync, readFileSync } from "node:fs";
import type { Feature, LineString, MultiPolygon, Polygon } from "geojson";
import { select } from "../db/supabase.ts";
import { HP_BOUNDARY } from "../geo/hpBoundary.ts";
import type { RoutePlan } from "../geo/routeTypes.ts";
import { distanceM, nearestPlace } from "../geo/snap.ts";
import { RISK_RANK, RISK_WORD, type AreaRisk, type RiskCell, type RiskLevel, type RiskStats, type RiskStretch, type RouteRisk } from "./types.ts";

const H = 3_600_000;
const TTL_MS = 30 * 60_000;

// ---------------------------------------------------------------- weather series

interface Series {
  t: number[]; // epoch ms (UTC hours)
  rain: number[];
  prob: number[];
  snow: number[];
}

const cache = new Map<string, { at: number; s: Series }>();
const keyOf = (lat: number, lng: number) => `${(Math.round(lat * 20) / 20).toFixed(2)},${(Math.round(lng * 20) / 20).toFixed(2)}`;

interface OmPoint {
  hourly: { time: string[]; precipitation: (number | null)[]; precipitation_probability?: (number | null)[]; snowfall?: (number | null)[] };
}

function toSeries(p: OmPoint, shiftMs = 0): Series {
  const h = p.hourly;
  return {
    t: h.time.map((x) => Date.parse(`${x}Z`) + shiftMs),
    rain: h.precipitation.map((x) => x ?? 0),
    // The archive has no probability: treat measured rain as certain.
    prob: h.precipitation_probability?.map((x) => x ?? 0) ?? h.precipitation.map((x) => ((x ?? 0) > 0.2 ? 100 : 0)),
    snow: h.snowfall?.map((x) => x ?? 0) ?? h.precipitation.map(() => 0),
  };
}

/** Live forecast for many points in ONE request (Open-Meteo takes comma lists), cached per ~5 km cell. */
async function liveSeries(points: { lat: number; lng: number }[]): Promise<Series[]> {
  const keys = points.map((p) => keyOf(p.lat, p.lng));
  const missing = [...new Set(keys.filter((k) => !(cache.get(k) && Date.now() - cache.get(k)!.at < TTL_MS)))];
  if (missing.length) {
    const lat = missing.map((k) => k.split(",")[0]).join(",");
    const lng = missing.map((k) => k.split(",")[1]).join(",");
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      "&hourly=precipitation,precipitation_probability,snowfall&forecast_days=3&past_hours=3&timezone=GMT";
    let body: OmPoint | OmPoint[] | null = null;
    for (let i = 0; i < 2 && !body; i++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
        body = (await res.json()) as OmPoint | OmPoint[];
      } catch (err) {
        if (i === 1) throw err;
      }
    }
    const list = Array.isArray(body) ? body : [body!];
    missing.forEach((k, i) => cache.set(k, { at: Date.now(), s: toSeries(list[i]!) }));
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  }
  return keys.map((k) => cache.get(k)!.s);
}

interface ReplayFile {
  date: string; // YYYY-MM-DD (IST day that is replayed as "today")
  source: string;
  points: (OmPoint & { lat: number; lng: number })[];
}

let replay: ReplayFile | null | undefined;
function loadReplay(): ReplayFile | null {
  if (replay !== undefined) return replay;
  const path = `${process.cwd()}/data/seed/weather/replay.json`;
  replay = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as ReplayFile) : null;
  return replay;
}

export function replayAvailable(): string | null {
  return loadReplay()?.date ?? null;
}

/** A real past day mapped onto today and repeated (≈ same clock times); nearest saved point within ~15 km. */
function replaySeries(points: { lat: number; lng: number }[]): Series[] {
  const r = loadReplay();
  if (!r) throw new Error("no replay file");
  const todayIst = new Date(Date.now() + 5.5 * H).toISOString().slice(0, 10);
  const shift = Date.parse(`${todayIst}T00:00:00Z`) - Date.parse(`${r.date}T00:00:00Z`);
  return points.map((p) => {
    let best = r.points[0]!;
    let bestM = Infinity;
    for (const q of r.points) {
      const m = distanceM(p.lat, p.lng, q.lat, q.lng);
      if (m < bestM) [best, bestM] = [q, m];
    }
    if (bestM >= 15_000) return { t: [], rain: [], prob: [], snow: [] };
    // Repeat the day for yesterday → +2 days so any departure in the next 48 h has "weather".
    const days = [-1, 0, 1, 2].map((d) => toSeries(best, shift + d * 24 * H));
    return { t: days.flatMap((x) => x.t), rain: days.flatMap((x) => x.rain), prob: days.flatMap((x) => x.prob), snow: days.flatMap((x) => x.snow) };
  });
}

// ---------------------------------------------------------------- scoring

/** Window totals between two times. */
function stats(s: Series, fromMs: number, toMs: number, slidesNearby: number): RiskStats {
  let rainMm = 0, maxHourlyMm = 0, maxChancePct = 0, snowCm = 0;
  s.t.forEach((t, i) => {
    if (t < fromMs || t > toMs) return;
    rainMm += s.rain[i]!;
    snowCm += s.snow[i]!;
    maxHourlyMm = Math.max(maxHourlyMm, s.rain[i]!);
    maxChancePct = Math.max(maxChancePct, s.prob[i]!);
  });
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { rainMm: r1(rainMm), maxHourlyMm: r1(maxHourlyMm), maxChancePct, snowCm: r1(snowCm), slidesNearby };
}

/** Rain on recently failed slopes is what closes Himachal roads: history bumps the level by one. */
export function levelOf(s: RiskStats): { level: RiskLevel; kind: "rain" | "snow" } {
  let lv = 0;
  if (s.rainMm >= 15 || s.maxHourlyMm >= 7) lv = 3;
  else if (s.rainMm >= 5 || s.maxHourlyMm >= 3) lv = 2;
  else if (s.rainMm >= 1 && s.maxChancePct >= 50) lv = 1;
  if (lv >= 1 && s.slidesNearby >= 2) lv = Math.min(3, lv + 1);
  let kind: "rain" | "snow" = "rain";
  const snowLv = s.snowCm >= 5 ? 3 : s.snowCm >= 1 ? 2 : 0;
  if (snowLv > lv) [lv, kind] = [snowLv, "snow"];
  return { level: (["none", "low", "moderate", "high"] as const)[lv]!, kind };
}

interface Slide {
  lat: number;
  lng: number;
}

/** Landslides / road damage / water on road started in the last 90 days (resolved ones count too). */
async function slideHistory(w: number, s: number, e: number, n: number): Promise<Slide[]> {
  const since = new Date(Date.now() - 90 * 24 * H).toISOString();
  return select<Slide>(
    "events",
    `select=lat,lng&type=in.(landslide,road_damage,flood_water)&started_at=gte.${since}` +
      `&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}&limit=1000`,
  ).catch(() => []);
}

const slidesNear = (slides: Slide[], lat: number, lng: number) => slides.filter((x) => distanceM(lat, lng, x.lat, x.lng) < 3000).length;

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric" });
const hourIst = (ms: number) => IST.format(new Date(ms)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
function hoursText(a: number, b: number): string {
  const [x, y] = [hourIst(a), hourIst(b)];
  return x === y ? `around ${x}` : x.slice(-2) === y.slice(-2) ? `around ${x.slice(0, -3)}–${y}` : `around ${x}–${y}`;
}

// ---------------------------------------------------------------- route

/** Risk along the recommended route, inside Himachal only, at the time you'd be on each stretch. */
export async function routeRisk(plan: RoutePlan, opts: { replay?: boolean } = {}): Promise<RouteRisk> {
  const best = plan.routes.find((r) => r.recommended) ?? plan.routes[0]!;
  const line = lineString(best.geometry.coordinates) as Feature<LineString>;
  const totalKm = length(line);
  const step = Math.max(6, totalKm / 40);
  const depart = new Date(plan.departAt).getTime();
  const samples: { km: number; lat: number; lng: number; at: number }[] = [];
  for (let km = step / 2; km < totalKm; km += step) {
    const [lng, lat] = along(line, km).geometry.coordinates as [number, number];
    if (!booleanPointInPolygon([lng, lat], HP_BOUNDARY)) continue;
    samples.push({ km, lat, lng, at: depart + (km / totalKm) * best.totalMin * 60_000 });
  }
  const base = { source: (opts.replay ? "replay" : "forecast") as "replay" | "forecast", replayDate: opts.replay ? loadReplay()?.date : undefined, checkedAt: new Date().toISOString() };
  if (!samples.length) return { level: "none", stretches: [], headline: null, weatherLine: "Weather is checked inside Himachal only", ...base };

  const lats = samples.map((p) => p.lat);
  const lngs = samples.map((p) => p.lng);
  const [series, slides] = await Promise.all([
    opts.replay ? Promise.resolve(replaySeries(samples)) : liveSeries(samples),
    slideHistory(Math.min(...lngs) - 0.05, Math.min(...lats) - 0.05, Math.max(...lngs) + 0.05, Math.max(...lats) + 0.05),
  ]);
  // Rain in the hour before you arrive loosens slopes too: window = 1 h before → 3 h after.
  const scored = samples.map((p, i) => {
    const st = stats(series[i]!, p.at - H, p.at + 3 * H, slidesNear(slides, p.lat, p.lng));
    return { ...p, ...st, ...levelOf(st) };
  });

  // Contiguous moderate/high samples → stretches.
  const groups: (typeof scored)[] = [];
  for (const p of scored) {
    if (RISK_RANK[p.level] < 2) continue;
    const last = groups[groups.length - 1];
    if (last && p.km - last[last.length - 1]!.km <= step * 1.5) last.push(p);
    else groups.push([p]);
  }
  const stretches: RiskStretch[] = await Promise.all(
    groups.map(async (g) => {
      const fromKm = Math.max(0, g[0]!.km - step / 2);
      const toKm = Math.min(totalKm, g[g.length - 1]!.km + step / 2);
      const worst = g.reduce((a, b) => (RISK_RANK[b.level] > RISK_RANK[a.level] || (b.level === a.level && b.rainMm > a.rainMm) ? b : a));
      const [a, b] = await Promise.all([
        nearestPlace(g[0]!.lat, g[0]!.lng).catch(() => null),
        nearestPlace(g[g.length - 1]!.lat, g[g.length - 1]!.lng).catch(() => null),
      ]);
      const slice = lineSliceAlong(line, fromKm, Math.max(toKm, fromKm + 0.5));
      const poly = buffer(slice, 1.5, { units: "kilometers" });
      return {
        level: worst.level,
        kind: worst.kind,
        fromKm: Math.round(fromKm),
        toKm: Math.round(toKm),
        place: a && b && a !== b ? `${a}–${b}` : (a ?? b),
        startAt: new Date(g[0]!.at).toISOString(),
        endAt: new Date(g[g.length - 1]!.at).toISOString(),
        rainMm: Math.max(...g.map((p) => p.rainMm)),
        maxHourlyMm: Math.max(...g.map((p) => p.maxHourlyMm)),
        maxChancePct: Math.max(...g.map((p) => p.maxChancePct)),
        snowCm: Math.max(...g.map((p) => p.snowCm)),
        slidesNearby: Math.max(...g.map((p) => p.slidesNearby)),
        polygon: poly!.geometry as Polygon | MultiPolygon,
      };
    }),
  );
  stretches.sort((x, y) => RISK_RANK[y.level] - RISK_RANK[x.level] || y.rainMm - x.rainMm);

  const level = stretches[0]?.level ?? (scored.some((p) => p.level === "low") ? "low" : "none");
  const top = stretches[0];
  const headline = top
    ? `${top.kind === "snow" ? (top.level === "high" ? "Heavy snow risk" : "Snow risk") : RISK_WORD[top.level]}${top.place ? ` near ${top.place}` : ""} (km ${top.fromKm}–${top.toKm}) · ` +
      `~${top.kind === "snow" ? `${top.snowCm} cm snow` : `${top.rainMm} mm rain`} ${hoursText(Date.parse(top.startAt) - H, Date.parse(top.endAt) + 3 * H)}` +
      (top.slidesNearby ? ` · ${top.slidesNearby} slide${top.slidesNearby > 1 ? "s" : ""} here in 90 days` : "") +
      (stretches.length > 1 ? ` · +${stretches.length - 1} more stretch${stretches.length > 2 ? "es" : ""}` : "")
    : null;
  const lightAt = scored.find((p) => p.level === "low");
  const lightPlace = !top && lightAt ? await nearestPlace(lightAt.lat, lightAt.lng).catch(() => null) : null;
  const weatherLine = top
    ? "Plan around the rain — slopes fail during and just after heavy rain"
    : lightAt
      ? `Light rain possible${lightPlace ? ` near ${lightPlace}` : ""} · low risk`
      : "Dry along the route for your trip";
  return { level, stretches, headline, weatherLine, ...base };
}

// ---------------------------------------------------------------- area (Nearby)

/** Grid of cells inside the radius (and Himachal), next 12 hours. */
export async function areaRisk(lat: number, lng: number, radiusKm: number, opts: { replay?: boolean } = {}): Promise<AreaRisk> {
  const stepKm = Math.max(2, radiusKm / 3.5);
  const dLat = stepKm / 111;
  const dLng = stepKm / (111 * Math.cos((lat * Math.PI) / 180));
  const n = Math.ceil(radiusKm / stepKm);
  const pts: { lat: number; lng: number }[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const p = { lat: lat + i * dLat, lng: lng + j * dLng };
      if (distanceM(lat, lng, p.lat, p.lng) / 1000 <= radiusKm + stepKm / 2 && booleanPointInPolygon([p.lng, p.lat], HP_BOUNDARY)) pts.push(p);
    }
  }
  const base = { source: (opts.replay ? "replay" : "forecast") as "replay" | "forecast", replayDate: opts.replay ? loadReplay()?.date : undefined, checkedAt: new Date().toISOString() };
  if (!pts.length) return { level: "none", cells: [], headline: "Rain risk is checked inside Himachal only", ...base };

  const now = Date.now();
  const [series, slides] = await Promise.all([
    opts.replay ? Promise.resolve(replaySeries(pts)) : liveSeries(pts),
    slideHistory(lng - (n + 1) * dLng, lat - (n + 1) * dLat, lng + (n + 1) * dLng, lat + (n + 1) * dLat),
  ]);
  const cells: RiskCell[] = pts
    .map((p, i) => {
      const st = stats(series[i]!, now - H, now + 12 * H, slidesNear(slides, p.lat, p.lng));
      const { level, kind } = levelOf(st);
      const [w, s, e, nn] = [p.lng - dLng / 2, p.lat - dLat / 2, p.lng + dLng / 2, p.lat + dLat / 2];
      const polygon: Polygon = { type: "Polygon", coordinates: [[[w, s], [e, s], [e, nn], [w, nn], [w, s]]] };
      return { ...p, ...st, level, kind, polygon };
    })
    .filter((c) => c.level !== "none");
  const level = cells.reduce<RiskLevel>((a, c) => (RISK_RANK[c.level] > RISK_RANK[a] ? c.level : a), "none");
  const risky = cells.filter((c) => RISK_RANK[c.level] >= 2);
  const wettest = cells.reduce((a, c) => (c.rainMm > a ? c.rainMm : a), 0);
  const headline =
    level === "none"
      ? `No rain risk within ${radiusKm} km in the next 12 hours`
      : risky.length
        ? `${RISK_WORD[level]} in ${risky.length} area${risky.length > 1 ? "s" : ""} within ${radiusKm} km · up to ~${wettest} mm in 12 h`
        : `Light rain possible within ${radiusKm} km · low risk`;
  return { level, cells, headline, ...base };
}

/** Rain/snow at one point over the next `hours` (Slope Sentinel). Throws if the forecast is unreachable. */
export async function pointRisk(
  lat: number,
  lng: number,
  hours = 24,
  opts: { replay?: boolean } = {},
): Promise<RiskStats & { level: RiskLevel; kind: "rain" | "snow"; source: "forecast" | "replay"; replayDate?: string; wettestAt: string | null }> {
  const d = 0.03;
  const [series, slides] = await Promise.all([
    opts.replay ? Promise.resolve(replaySeries([{ lat, lng }])) : liveSeries([{ lat, lng }]),
    slideHistory(lng - d, lat - d, lng + d, lat + d),
  ]);
  const s = series[0]!;
  const now = Date.now();
  const st = stats(s, now - H, now + hours * H, slidesNear(slides, lat, lng));
  let wettest = -1;
  let wettestAt: string | null = null;
  s.t.forEach((t, i) => {
    if (t >= now - H && t <= now + hours * H && s.rain[i]! > wettest && s.rain[i]! >= 1) [wettest, wettestAt] = [s.rain[i]!, new Date(t).toISOString()];
  });
  return { ...st, ...levelOf(st), source: opts.replay ? "replay" : "forecast", replayDate: opts.replay ? loadReplay()?.date : undefined, wettestAt };
}

/** For scripts/test-risk.ts (scoring without the network). */
export const _internal = { stats, toSeries };
