// Slope Sentinel, plain code: the fallback risk matrix and the caps every assessment passes through
// (the model proposes, code decides — the same rule as the Investigator). No AI, no network.
import type { RiskLevel } from "../risk/types.ts";
import { SLOPE_LEVELS, SLOPE_RANK, type SlopeLevel } from "./types.ts";

export type Overall = "none" | "minor" | "concerning" | "severe";
const OVERALL_RANK: Record<Overall, number> = { none: 0, minor: 1, concerning: 2, severe: 3 };

export const HIGH_NEEDS_READING_WITHIN_H = 48;
export const DECAY_AFTER_H = 72;

export interface MatrixInput {
  /** Newest checked reading's overall (after the second model's downgrade; reject → none). */
  overall: Overall;
  rain: RiskLevel | null;
  slides90d: number;
  /** Change metrics show signs growing / new signs between photos. */
  growing: boolean;
}

/**
 * Code fallback (no AI): slope reading × rain × history × growth.
 * minor/concerning → watch, severe → elevated; each of {moderate+ rain, growth, ≥2 slides in 90 days} adds a step (max +2).
 */
export function codeLevel(m: MatrixInput): { level: SlopeLevel; reasons: string[] } {
  const r = OVERALL_RANK[m.overall];
  if (r === 0) return { level: "none", reasons: ["No warning signs in the latest checked photo"] };
  let lv = r === 3 ? 2 : 1;
  const reasons = [`Latest photo: ${m.overall} warning signs`];
  let bumps = 0;
  if (m.rain === "moderate" || m.rain === "high") {
    bumps++;
    reasons.push(m.rain === "high" ? "Heavy rain forecast in the next 24 h" : "Rain forecast in the next 24 h");
  }
  if (m.growing) {
    bumps++;
    reasons.push("Signs grew between photos (approximate)");
  }
  if (m.slides90d >= 2) {
    bumps++;
    reasons.push(`${m.slides90d} slides within 3 km in the last 90 days`);
  }
  lv = Math.min(3, lv + Math.min(2, bumps));
  return { level: SLOPE_LEVELS[lv]!, reasons };
}

export interface CapInput {
  proposed: SlopeLevel;
  previous: SlopeLevel;
  /** A new observation arrived since the last assessment. */
  newPhoto: boolean;
  /** Hours since the newest concerning/severe reading that two different models checked (null = none). */
  qualifyingReadingAgeH: number | null;
  /** Hours since the newest photo of this site (null = no photo). */
  lastPhotoAgeH: number | null;
}

/**
 * 1. Without a new photo the level rises at most one step per run.
 * 2. "high" needs a two-model-checked concerning/severe reading < 48 h old.
 * 3. No photo for 72 h → at most "watch" (decay).
 */
export function applyCaps(c: CapInput): { level: SlopeLevel; note: string | null } {
  let lv = SLOPE_RANK[c.proposed];
  const notes: string[] = [];
  if (!c.newPhoto && lv > SLOPE_RANK[c.previous] + 1) {
    lv = SLOPE_RANK[c.previous] + 1;
    notes.push("rises one step at a time without a new photo");
  }
  if (lv === 3 && (c.qualifyingReadingAgeH === null || c.qualifyingReadingAgeH > HIGH_NEEDS_READING_WITHIN_H)) {
    lv = 2;
    notes.push(`"high" needs a two-model-checked photo from the last ${HIGH_NEEDS_READING_WITHIN_H} h`);
  }
  if (c.lastPhotoAgeH !== null && c.lastPhotoAgeH > DECAY_AFTER_H && lv > 1) {
    lv = 1;
    notes.push(`no new photo for ${DECAY_AFTER_H} h`);
  }
  return { level: SLOPE_LEVELS[lv]!, note: notes.length ? `Capped by code: ${notes.join("; ")}` : null };
}
