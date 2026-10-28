// Client-safe, plain code (no AI): debris volume → clearing time, and the reopening predictor.
// Every number is a range (CLAUDE.md 6.2 rule 2); no basis → null, never a made-up number.
//
// Volume on the carriageway = blocked length × blocked width × depth. Length and width come from the
// SAM measurements (metres via a reference object or the two-lane assumption); depth can't be seen
// in a photo, so it's an assumption by how much of the road is buried (shown in the "how" text).
// Clearing rate: a backhoe/excavator loading tippers on a narrow hill road moves ~12–30 m³/h of loose
// slide debris (boulders, wet clay and traffic in one lane are the slow end).

export interface Range {
  min: number;
  max: number;
}

interface Measured {
  blockedLengthM?: Range | null;
  blockedPct?: Range | null;
  roadTotalWidthM?: Range | number | null;
  roadWidthLeftM?: Range | null;
}

const TWO_LANE_M: Range = { min: 5.5, max: 7.5 };
const ONE_LANE_M = 3.5; // what a car / small bus needs to pass in one direction
const RATE_M3_H: Range = { min: 12, max: 30 }; // per digging machine
const SETUP_H: Range = { min: 0.5, max: 1 }; // machine in place, first tipper, traffic held
const DEBRIS_TYPES = new Set(["landslide"]);

const mid = (r: Range) => (r.min + r.max) / 2;
const asRange = (v: Range | number | null | undefined): Range | null => (v == null ? null : typeof v === "number" ? { min: v, max: v } : v);
const round = (r: Range, step: number): Range => ({ min: Math.max(step, Math.round(r.min / step) * step), max: Math.max(step, Math.round(r.max / step) * step) });

/** Depth of debris on the road, assumed from how much of the cross-section is buried. */
function depthM(blockedPct: Range): Range {
  const p = mid(blockedPct);
  if (p >= 90) return { min: 0.8, max: 2.5 }; // slide across the whole road
  if (p >= 40) return { min: 0.5, max: 1.5 };
  return { min: 0.3, max: 0.8 }; // rocks / a tongue of debris at the edge
}

/**
 * m³ of debris ON the carriageway (what has to be moved to reopen it). null without length + width.
 * Multiplying every min × min and max × max compounds into a useless 7× spread, so this takes the
 * central estimate and gives it a fixed −40 % / +50 % band.
 */
export function debrisVolumeM3(type: string, m: Measured | null | undefined): Range | null {
  if (!m || !DEBRIS_TYPES.has(type) || !m.blockedLengthM || !m.blockedPct) return null;
  if (m.blockedPct.max <= 0 || m.blockedLengthM.max <= 0) return null;
  const width = asRange(m.roadTotalWidthM) ?? TWO_LANE_M;
  const v = mid(m.blockedLengthM) * mid(width) * (mid(m.blockedPct) / 100) * mid(depthM(m.blockedPct));
  const step = v > 400 ? 50 : v > 40 ? 10 : 1;
  return round({ min: v * 0.6, max: v * 1.5 }, step);
}

/** Digging machines in a list like ["JCB", "JCB"] or ["2 JCB", "1 tipper"] (tippers only haul). */
export function diggingMachines(machines: string[] | null | undefined): number {
  let n = 0;
  for (const raw of machines ?? []) {
    const s = raw.toLowerCase();
    if (!/jcb|excavator|backhoe|loader|poclain|dozer|digger|snow ?cutter/.test(s)) continue;
    n += Number(/^\s*(\d+)/.exec(s)?.[1] ?? 1);
  }
  return Math.min(n, 4); // more than ~4 can't work one face of a slide at once
}

export interface ClearingEstimate {
  /** Hours from crew start until one lane is passable (null when it already is). */
  oneLaneH: Range | null;
  /** Hours from crew start until the road is fully clear. */
  fullH: Range;
  machines: number;
  volume: Range;
}

/**
 * Hours of machine work for a debris volume. One lane needs only the share of the blocked width
 * that stands between the current gap and ~3.5 m, along the whole blocked length.
 */
export function clearingHours(volume: Range, machines: number, m: Measured | null | undefined): ClearingEstimate | null {
  if (machines < 1) return null;
  // Two machines on one slide don't double the rate: they share one face and one line of tippers.
  const eff = machines === 1 ? 1 : 1 + (machines - 1) * 0.6;
  // Central time from the band's middle, then a −35 % / +60 % band (debris is often wetter/bigger than it looks).
  const hours = (v: Range): Range => {
    const h = mid(SETUP_H) + mid(v) / (mid(RATE_M3_H) * eff);
    return { min: h * 0.65, max: h * 1.6 };
  };
  const width = asRange(m?.roadTotalWidthM) ?? TWO_LANE_M;
  const left = m?.roadWidthLeftM ? mid(m.roadWidthLeftM) : null;
  let oneLane: Range | null = null;
  if (left === null || left < ONE_LANE_M) {
    const blockedW = Math.max(0.5, mid(width) - (left ?? 0));
    const share = Math.min(1, Math.max(0.15, (ONE_LANE_M - (left ?? 0)) / blockedW));
    oneLane = hours({ min: volume.min * share, max: volume.max * share });
  }
  return { oneLaneH: oneLane, fullH: hours(volume), machines, volume };
}

// ---------------------------------------------------------------- reopening predictor (photo sequence)

export interface ProgressPoint {
  at: string;
  /** % of the cross-section blocked at that time (mid of the measured range). */
  blockedPct: number;
  source: "photo" | "official";
}

export interface TrendFit {
  /** Percentage points of blockage removed per hour (> 0 = clearing). */
  ratePerH: number;
  points: number;
  spanH: number;
  latest: ProgressPoint;
}

const MIN_SPAN_H = 0.33; // photos 20+ min apart, else the "trend" is noise between two shots
const ONE_LANE_PCT = 50; // ~half of a 7 m road free ≈ one lane
const OPEN_PCT = 5;

/** Least-squares line through blockedPct over time, last 24 h of points. null if there's no usable trend. */
export function fitTrend(points: ProgressPoint[], now = Date.now()): TrendFit | null {
  const pts = points
    .filter((p) => Number.isFinite(p.blockedPct) && now - new Date(p.at).getTime() < 24 * 3_600_000)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (pts.length < 2) return null;
  const t0 = new Date(pts[0]!.at).getTime();
  const xs = pts.map((p) => (new Date(p.at).getTime() - t0) / 3_600_000);
  const ys = pts.map((p) => p.blockedPct);
  const spanH = xs[xs.length - 1]!;
  if (spanH < MIN_SPAN_H) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  if (sxx === 0) return null;
  return { ratePerH: -sxy / sxx, points: pts.length, spanH, latest: pts[pts.length - 1]! };
}

export interface Reopening {
  method: "photo_trend" | "debris_volume" | "none";
  /** ISO windows. oneLane null = already one lane or better / not predictable. */
  oneLane: { earliest: string; latest: string } | null;
  fullyOpen: { earliest: string; latest: string } | null;
  /** "3 photos, 9:10 AM–1:40 PM: ~12% of the road cleared per hour" — shown under the line. */
  basis: string;
  /** No visible progress: crews absent or stuck. */
  stalled?: boolean;
  debrisVolumeM3: Range | null;
  machines: number;
}

export interface ReopeningInput {
  type: string;
  status: string;
  measurements: Measured | null | undefined;
  points: ProgressPoint[];
  /** Digging machines on site now (crew assigned or the latest field update). */
  machines: number;
  now?: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const win = (now: number, h: Range) => ({ earliest: iso(now + h.min * 3_600_000), latest: iso(now + h.max * 3_600_000) });

/**
 * Prefer the photo trend (what the road actually did); fall back to debris volume ÷ machine rate.
 * The trend's rate gets ±30% so a 2-photo line doesn't read as precise.
 */
export function predictReopening(input: ReopeningInput): Reopening {
  const now = input.now ?? Date.now();
  const volume = debrisVolumeM3(input.type, input.measurements);
  const base = { debrisVolumeM3: volume, machines: input.machines };
  if (input.status === "open") return { ...base, method: "none", oneLane: null, fullyOpen: null, basis: "Road reported open" };

  const trend = fitTrend(input.points, now);
  if (trend) {
    const n = `${trend.points} ${trend.points === 1 ? "photo" : "photos"} over ~${trend.spanH < 1.5 ? `${Math.round(trend.spanH * 60)} min` : `${Math.round(trend.spanH)} h`}`;
    if (trend.ratePerH < 2) {
      // No progress in the photos: before a crew starts that's expected — the volume estimate still says how long once one does.
      const fromVolume = volume ? fromDebris(volume, input, now) : null;
      return fromVolume
        ? { ...fromVolume, stalled: true, basis: `${n}: no progress visible yet · ${fromVolume.basis}` }
        : { ...base, method: "photo_trend", oneLane: null, fullyOpen: null, stalled: true, basis: `${n}: no clear progress visible yet` };
    }
    // Time since the latest point already counts toward the next threshold.
    const sinceH = (now - new Date(trend.latest.at).getTime()) / 3_600_000;
    const hoursTo = (target: number): Range | null => {
      if (trend.latest.blockedPct <= target) return null;
      const h = (trend.latest.blockedPct - target) / trend.ratePerH - sinceH;
      return { min: Math.max(0.25, h / 1.3), max: Math.max(0.5, h / 0.7) };
    };
    const one = input.status === "closed" ? hoursTo(ONE_LANE_PCT) : null;
    const full = hoursTo(OPEN_PCT);
    return {
      ...base,
      method: "photo_trend",
      oneLane: one ? win(now, one) : null,
      fullyOpen: full ? win(now, full) : null,
      basis: `${n}: ~${Math.round(trend.ratePerH)}% of the road cleared per hour`,
    };
  }

  if (volume) return fromDebris(volume, input, now);
  return { ...base, method: "none", oneLane: null, fullyOpen: null, basis: "Not enough measurements to predict yet" };
}

function fromDebris(volume: Range, input: ReopeningInput, now: number): Reopening {
  const base = { debrisVolumeM3: volume, machines: input.machines, method: "debris_volume" as const };
  const est = clearingHours(volume, input.machines, input.measurements);
  if (!est) return { ...base, oneLane: null, fullyOpen: null, basis: `~${volume.min}–${volume.max} m³ of debris on the road · times start once a machine is on site` };
  return {
    ...base,
    oneLane: est.oneLaneH && input.status === "closed" ? win(now, est.oneLaneH) : null,
    fullyOpen: win(now, est.fullH),
    basis: `~${volume.min}–${volume.max} m³ of debris · ${input.machines} machine${input.machines > 1 ? "s" : ""} at ~12–30 m³/h each`,
  };
}
