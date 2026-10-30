// "Can my vehicle cross?" (Phase 6C) — the maths, plain code, no AI. Client-safe (route rows use it).
//   needed = width incl. mirrors + 2 × 0.3 m safety (+0.3 m when the open side is a valley / collapsed edge)
//   gap.min > needed → fits · gap.max < width incl. mirrors + 0.2 m → won't fit · otherwise tight
//   no gap measured → unknown · newest road photo > 6 h old (or none) → at best "tight"
// The AI can only lower this verdict (lowerOnly), never raise it.
import { CATEGORIES, MIRRORS_M, categoryById, vehicleById, vehicleName, type VehicleCategory } from "./vehicles.ts";
import { FIT_RANK, type FitResult, type FitVerdict, type RoadSide, type VehicleProfile } from "./types.ts";

export const SAFETY_EACH_SIDE_M = 0.3;
export const EDGE_EXTRA_M = 0.3;
export const STALE_AFTER_H = 6;
const LONG_M = 6.5;

const r1 = (x: number) => Math.round(x * 10) / 10;
const m = (x: number) => `${r1(x).toFixed(1)} m`;
const rangeText = (r: { min: number; max: number }) => (r1(r.min) === r1(r.max) ? `~${m(r.min)}` : `~${r1(r.min).toFixed(1)}–${m(r.max)}`);

/** A spec-table vehicle or a category → the profile the maths uses. */
export function profileFor(sel: { vehicleId?: string | null; category?: string | null; roofLoad?: boolean }): VehicleProfile | null {
  const v = vehicleById(sel.vehicleId);
  if (v) {
    const c = categoryById(v.category)!;
    return {
      vehicleId: v.id, category: v.category, name: vehicleName(v),
      widthM: { min: v.widthMm / 1000, max: v.widthMm / 1000 }, mirrorsM: MIRRORS_M[v.category],
      lengthM: { min: v.lengthMm / 1000, max: v.lengthMm / 1000 },
      clearanceMm: v.clearanceMm ? { min: v.clearanceMm, max: v.clearanceMm } : c.clearanceMm,
      fourByFour: v.fourByFour, roofLoad: Boolean(sel.roofLoad), source: "spec", specUrl: v.sources[0] ?? null,
    };
  }
  const c = categoryById(sel.category);
  if (!c) return null;
  return {
    vehicleId: null, category: c.id, name: c.label, widthM: c.widthM, mirrorsM: MIRRORS_M[c.id as VehicleCategory],
    lengthM: c.lengthM, clearanceMm: c.clearanceMm, fourByFour: false, roofLoad: Boolean(sel.roofLoad), source: "category", specUrl: null,
  };
}

export function computeFit(v: VehicleProfile, road: RoadSide): FitResult {
  const wm = { min: v.widthM.min + v.mirrorsM, max: v.widthM.max + v.mirrorsM };
  const safetyM = 2 * SAFETY_EACH_SIDE_M + (road.edgeRisk ? EDGE_EXTRA_M : 0);
  const neededM = wm.max + safetyM;
  const gap = road.gapM;
  const caps: string[] = [];
  let verdict: FitVerdict;
  if (!gap) verdict = "unknown";
  else if (gap.min > neededM) verdict = "fits";
  else if (gap.max < wm.min + 0.2) verdict = "wont_fit";
  else verdict = "tight";
  const foldMirrorsHelps = Boolean(gap && v.mirrorsM > 0 && verdict !== "fits" && gap.min > v.widthM.max + safetyM);

  if (verdict === "fits" && (road.photoAgeH === null || road.photoAgeH > STALE_AFTER_H)) {
    verdict = "tight";
    caps.push(road.photoAgeH === null ? "no recent photo of the gap — conditions may have changed" : `newest road photo is ~${Math.round(road.photoAgeH)} h old — conditions may have changed`);
  }
  if (road.status === "closed" && verdict !== "wont_fit") {
    verdict = "wont_fit";
    caps.push("the road is closed right now");
  }
  if (road.status === "closed" && gap && gap.max < 0.5) caps.push("fully blocked — this check is for when it reopens to one lane");

  const lengthNote =
    v.lengthM.max >= LONG_M
      ? `Long vehicle (~${Math.round(v.lengthM.max)} m): a one-lane gap at a bend or hairpin may need a spotter and several turns — follow police / PWD on site.`
      : null;
  const headline = gap
    ? `Your ${v.name} (${rangeText(wm)} with mirrors) vs gap ${rangeText(gap)}`
    : `Your ${v.name} (${rangeText(wm)} with mirrors) — the road photos don't show the gap clearly`;
  return { verdict, headline, widthWithMirrorsM: wm, neededM, safetyM, gapM: gap, foldMirrorsHelps, caps, lengthNote };
}

/** The AI can lower the code verdict (e.g. rubble too high for the clearance) but never raise it. */
export function lowerOnly(code: FitVerdict, ai: FitVerdict | null | undefined): FitVerdict {
  return ai && FIT_RANK[ai] < FIT_RANK[code] ? ai : code;
}

/** Road side from an event's stored measurements (code). */
export function roadSideOf(e: { type: string; status: string; measurements?: Record<string, unknown> | null; photoAt?: string | null }): RoadSide {
  const ms = (e.measurements ?? {}) as { roadWidthLeftM?: { min: number; max: number } | null; roadTotalWidthM?: number | { min: number; max: number } | null };
  const total = ms.roadTotalWidthM;
  return {
    type: e.type,
    status: e.status,
    gapM: ms.roadWidthLeftM ?? null,
    totalM: typeof total === "number" ? total : total ? (total.min + total.max) / 2 : null,
    photoAgeH: e.photoAt ? Math.max(0, (Date.now() - new Date(e.photoAt).getTime()) / 3_600_000) : null,
    edgeRisk: e.type === "road_damage",
  };
}

export { CATEGORIES };
