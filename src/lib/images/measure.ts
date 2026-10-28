// Server-only: turn SAM masks into road measurements (CLAUDE.md 6.2 rules 2–3).
// Every number is a range. Metres come only from a reference object in the frame
// (vehicle, excavator) or the documented two-lane assumption (~7 m); otherwise "unknown".
//
// Method (on a coarse grid, ~160 cells wide):
// 1. Road direction = principal axis of the road mask. Cross-sections run across it
//    (rows if the road runs up the image, columns if it runs sideways).
// 2. Per cross-section: carriageway = first..last road cell; blocked = debris cells inside it.
//    Rocks touching the carriageway edge extend it (up to 30% per side) and count as blocked.
//    Sections with a landslide mask but no road, between sections that have road, are fully
//    blocked (slide buries the carriageway, road visible on both sides). Loose rocks never bridge:
//    a gap full of stones is usually a shoulder or a second stretch of road further away.
// 3. Worst sections give blockedPct; their count along the axis gives the blocked length.
import { decodeMaskToRaster } from "@meta-sam/parser";
import type { SamResult } from "../ai/sam.ts";

export interface Range {
  min: number;
  max: number;
}

export interface PhotoMeasurements {
  /** % of the carriageway cross-section covered at the worst point. */
  blockedPct?: Range;
  roadTotalWidthM?: Range;
  roadWidthLeftM?: Range;
  /** Length of road affected, along the road. Perspective makes this the roughest number. */
  blockedLengthM?: Range;
  vehiclesVisible?: number;
  machinesVisible?: number;
  /** % of the visible carriageway covered by snow. */
  snowCoverPct?: number;
  /** % of the whole image that is slide/rock (context for the claim writer). */
  debrisImagePct?: number;
  method: {
    reference: "vehicle" | "excavator" | "two_lane_assumption" | "none";
    notes: string[];
  };
  confidence: number;
}

export type ConceptResults = Partial<Record<string, SamResult | null>>;

const GRID_W = 160;
const MIN_CONF = 0.3;
const REF_SIZES = {
  // Box HEIGHT in metres — height barely changes with viewing angle, width does (side vs front).
  vehicle: { min: 1.45, max: 2.6 }, // car ≈1.5, SUV ≈1.8, truck/bus up to ≈3 (rarely fully in frame)
  excavator: { min: 2.7, max: 3.6 }, // JCB backhoe / tracked excavator cab height
};
const TWO_LANE_M = { min: 5.5, max: 7.5 }; // HP two-lane highway incl. shoulders; NH two-lane ≈ 7 m
const DEBRIS_CONCEPTS = ["landslide", "rock"];
const EDGE_MAX = 0.3;
const PLAUSIBLE_ROAD_M = { min: 3, max: 14 }; // a scale implying a road outside this is wrong (steep angle, bad box)

interface Grid {
  gw: number;
  gh: number;
  cellPx: number; // source pixels per grid cell (square cells)
}

function rasterize(r: SamResult | null | undefined, W: number, H: number, g: Grid): Uint8Array {
  const out = new Uint8Array(g.gw * g.gh);
  for (const m of r?.masks ?? []) {
    if (m.confidence !== undefined && m.confidence < MIN_CONF) continue;
    const raster = decodeMaskToRaster(m.record.mask);
    const { width: mw, height: mh } = m.record.mask;
    const { left, top, right, bottom } = m.bounds;
    const gx0 = Math.max(0, Math.floor((left / W) * g.gw));
    const gx1 = Math.min(g.gw - 1, Math.ceil((right / W) * g.gw));
    const gy0 = Math.max(0, Math.floor((top / H) * g.gh));
    const gy1 = Math.min(g.gh - 1, Math.ceil((bottom / H) * g.gh));
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = ((gy + 0.5) / g.gh) * H;
      if (cy < top || cy >= bottom) continue;
      const my = Math.min(mh - 1, Math.floor(((cy - top) / (bottom - top)) * mh));
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = ((gx + 0.5) / g.gw) * W;
        if (cx < left || cx >= right) continue;
        const mx = Math.min(mw - 1, Math.floor(((cx - left) / (right - left)) * mw));
        if (raster[my * mw + mx]) out[gy * g.gw + gx] = 1;
      }
    }
  }
  return out;
}

const count = (a: Uint8Array) => a.reduce((t, v) => t + v, 0);
const pct = (x: number) => Math.round(x * 100);
const r1 = (x: number) => Math.round(x * 10) / 10;
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!;
};

function confidentBoxes(r: SamResult | null | undefined, minHeightPx: number) {
  return (r?.boxes ?? []).filter(
    (b) => (b.confidence === undefined || b.confidence >= 0.4) && b.bottom - b.top >= minHeightPx,
  );
}

export function measure(results: ConceptResults, W: number, H: number): PhotoMeasurements {
  const notes: string[] = [];
  const cellPx = W / GRID_W;
  const g: Grid = { gw: GRID_W, gh: Math.max(1, Math.round(H / cellPx)), cellPx };

  const vehicles = confidentBoxes(results.vehicle, 0);
  const machines = confidentBoxes(results.excavator, 0);
  const base: PhotoMeasurements = {
    vehiclesVisible: results.vehicle ? vehicles.length : undefined,
    machinesVisible: results.excavator ? machines.length : undefined,
    method: { reference: "none", notes },
    confidence: 0.2,
  };

  const road = rasterize(results.road, W, H, g);
  const debris = new Uint8Array(g.gw * g.gh);
  for (const c of DEBRIS_CONCEPTS) rasterize(results[c], W, H, g).forEach((v, i) => (debris[i] ||= v));
  const slide = rasterize(results.landslide, W, H, g);
  const snow = rasterize(results.snow, W, H, g);
  base.debrisImagePct = pct(count(debris) / debris.length);

  if (!results.road) {
    notes.push("road segmentation unavailable");
    return base;
  }
  if (count(road) < 20) {
    notes.push("road surface not detected in the photo");
    return base;
  }

  // 1. Road direction from the principal axis of road cells.
  let sx = 0, sy = 0, n = 0;
  road.forEach((v, i) => { if (v) { sx += i % g.gw; sy += Math.floor(i / g.gw); n++; } });
  const mx = sx / n, my = sy / n;
  let cxx = 0, cyy = 0, cxy = 0;
  road.forEach((v, i) => {
    if (!v) return;
    const dx = (i % g.gw) - mx, dy = Math.floor(i / g.gw) - my;
    cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
  });
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const sideways = Math.abs(Math.cos(theta)) >= Math.abs(Math.sin(theta)); // road runs left↔right
  const nSections = sideways ? g.gw : g.gh;
  const nAcross = sideways ? g.gh : g.gw;
  const at = (a: Uint8Array, s: number, t: number) => (sideways ? a[t * g.gw + s] : a[s * g.gw + t])!;
  // Pixel position of a section (for picking the nearest reference object).
  const sectionRowPx = (s: number, mid: number) => (sideways ? (mid + 0.5) * cellPx : (s + 0.5) * cellPx);

  // 2. Cross-sections.
  interface Section { s: number; a: number; b: number; span: number; blocked: number; snow: number; bridged: boolean }
  const sections: (Section | null)[] = [];
  for (let s = 0; s < nSections; s++) {
    let a = -1, b = -1;
    for (let t = 0; t < nAcross; t++) if (at(road, s, t)) { if (a < 0) a = t; b = t; }
    if (a < 0 || b - a + 1 < 3) { sections.push(null); continue; }
    // Rocks touching the road edge narrow it too (the road mask stops where they start).
    // Extend over contiguous debris, at most EDGE_MAX of the span per side, so a hillside doesn't count.
    const maxExt = Math.floor((b - a + 1) * EDGE_MAX);
    for (let k = 0; k < maxExt && a > 0 && at(debris, s, a - 1); k++) a--;
    for (let k = 0; k < maxExt && b < nAcross - 1 && at(debris, s, b + 1); k++) b++;
    let blocked = 0, snowy = 0;
    for (let t = a; t <= b; t++) {
      if (at(road, s, t)) { if (at(snow, s, t)) snowy++; continue; }
      if (at(debris, s, t)) blocked++;
      else if (at(snow, s, t)) snowy++;
    }
    sections.push({ s, a, b, span: b - a + 1, blocked, snow: snowy, bridged: false });
  }
  // Bridge: landslide with no road, between road sections → whole carriageway buried.
  const roadIdx = sections.flatMap((x, i) => (x ? [i] : []));
  const firstRoad = roadIdx[0]!, lastRoad = roadIdx[roadIdx.length - 1]!;
  for (let s = firstRoad + 1; s < lastRoad; s++) {
    if (sections[s]) continue;
    let prev = s - 1; while (!sections[prev]) prev--;
    let next = s + 1; while (!sections[next]) next++;
    const p = sections[prev]!, q = sections[next]!;
    const a = Math.round((p.a + q.a) / 2), b = Math.round((p.b + q.b) / 2);
    let d = 0;
    for (let t = a; t <= b; t++) if (at(slide, s, t)) d++;
    if (b - a + 1 >= 3 && d / (b - a + 1) >= 0.5) {
      sections[s] = { s, a, b, span: b - a + 1, blocked: b - a + 1, snow: 0, bridged: true };
    }
  }

  const valid = sections.filter((x): x is Section => x !== null);
  const totalSpan = valid.reduce((t, x) => t + x.span, 0);
  if (results.snow) base.snowCoverPct = pct(valid.reduce((t, x) => t + x.snow, 0) / totalSpan);

  const affected = valid.filter((x) => x.blocked / x.span >= 0.1);
  if (!affected.length) {
    notes.push("no slide or rocks on the visible carriageway");
    return { ...base, blockedPct: { min: 0, max: 0 }, confidence: 0.5 };
  }
  const fracs = affected.map((x) => x.blocked / x.span);
  const worst = affected.reduce((w, x) => (x.blocked / x.span > w.blocked / w.span ? x : w));
  const blockedFrac = { min: quantile(fracs, 0.75), max: Math.max(...fracs) };
  // Few cross-sections → a single noisy row decides the number; widen it instead of faking precision.
  if (affected.length < 3) blockedFrac.min = Math.min(blockedFrac.min, blockedFrac.max * 0.7);
  if (affected.some((x) => x.bridged)) notes.push("slide covers the full carriageway where road is visible on both sides");

  // 3. Scale: reference object nearest (in image rows) to the worst section.
  const worstRowPx = sectionRowPx(worst.s, (worst.a + worst.b) / 2);
  const refs = [
    ...vehicles.map((b) => ({ kind: "vehicle" as const, b })),
    ...machines.map((b) => ({ kind: "excavator" as const, b })),
  ].filter((r) => r.b.bottom - r.b.top >= 12); // tiny far-away boxes are too noisy
  let mPerPx: Range | null = null;
  let reference: PhotoMeasurements["method"]["reference"] = "none";
  let confidence = 0.3;
  if (refs.length) {
    const best = refs.reduce((p, r) => (Math.abs(r.b.bottom - worstRowPx) < Math.abs(p.b.bottom - worstRowPx) ? r : p));
    const hPx = best.b.bottom - best.b.top;
    const size = REF_SIZES[best.kind];
    mPerPx = { min: size.min / hPx, max: size.max / hPx };
    reference = best.kind;
    confidence = 0.55;
    const impliedRoadM = (worst.span * cellPx * (mPerPx.min + mPerPx.max)) / 2;
    if (impliedRoadM < PLAUSIBLE_ROAD_M.min || impliedRoadM > PLAUSIBLE_ROAD_M.max) {
      notes.push(`${best.kind} scale gives an implausible ${impliedRoadM.toFixed(1)} m road (camera angle) — ignored`);
      mPerPx = null;
      reference = "none";
      confidence = 0.3;
    } else if (Math.abs(best.b.bottom - worstRowPx) > 0.2 * H) {
      mPerPx = { min: mPerPx.min * 0.75, max: mPerPx.max * 1.35 };
      confidence = 0.4;
      notes.push(`scale from a ${best.kind} at a different distance than the blockage (wider range)`);
    } else {
      notes.push(`scale from a ${best.kind} near the blockage`);
    }
  }

  const spanPx = worst.span * cellPx;
  let roadWidth: Range;
  if (mPerPx) {
    roadWidth = { min: spanPx * mPerPx.min, max: spanPx * mPerPx.max };
  } else {
    roadWidth = TWO_LANE_M;
    mPerPx = { min: TWO_LANE_M.min / spanPx, max: TWO_LANE_M.max / spanPx };
    reference = "two_lane_assumption";
    notes.push("no reference object — assumed a two-lane road (5.5–7.5 m)");
  }

  // Along-road length: affected sections × cell size. Perspective foreshortens distance → widen the top end.
  const lengthPx = affected.length * cellPx;
  notes.push("blocked length is rough: perspective compresses distance along the road");

  return {
    ...base,
    blockedPct: { min: pct(blockedFrac.min), max: pct(blockedFrac.max) },
    roadTotalWidthM: { min: r1(roadWidth.min), max: r1(roadWidth.max) },
    roadWidthLeftM: {
      min: r1(roadWidth.min * (1 - blockedFrac.max)),
      max: r1(roadWidth.max * (1 - blockedFrac.min)),
    },
    blockedLengthM: { min: Math.round(lengthPx * mPerPx.min), max: Math.round(lengthPx * mPerPx.max * 2) },
    method: { reference, notes },
    confidence: valid.length >= 10 ? confidence + 0.1 : confidence,
  };
}
