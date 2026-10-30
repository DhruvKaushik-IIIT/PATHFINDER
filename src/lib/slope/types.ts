// Client-safe shapes for Slope Sentinel (Phase 6B): warning signs on the hillside above a road,
// read from traveller photos by two models, tracked over time and combined with rain + slide history.
// Risk is advice only — it never changes an event's status or closes a road.
import type { SlopeCheck, SlopeReading, SlopeRisk } from "../ai/schemas.ts";
import type { ModelSource } from "../verification/types.ts";

export type SlopeLevel = "none" | "watch" | "elevated" | "high";
export const SLOPE_RANK: Record<SlopeLevel, number> = { none: 0, watch: 1, elevated: 2, high: 3 };
export const SLOPE_LEVELS: SlopeLevel[] = ["none", "watch", "elevated", "high"];
export const SLOPE_WORD: Record<SlopeLevel, string> = { none: "No signs", watch: "Watch", elevated: "Elevated", high: "High" };
export const SLOPE_WORD_HI: Record<SlopeLevel, string> = { none: "कोई संकेत नहीं", watch: "नज़र रखें", elevated: "बढ़ा हुआ ख़तरा", high: "ज़्यादा ख़तरा" };

export const SIGN_LABEL: Record<string, string> = {
  tension_crack: "Crack in the ground",
  wall_crack: "Cracked wall",
  wall_bulge: "Bulging wall",
  seepage: "Water seeping",
  fresh_rockfall: "Loose rocks",
  leaning_trees: "Leaning trees",
  fresh_scar: "Fresh slide scar",
  undercut_toe: "Undercut slope",
  loose_overhang: "Loose overhang",
  other: "Other sign",
};

/** SAM concepts that are useful on slopes (Phase 6B probe: crack/fissure find nothing → the model reads cracks). */
export const SLOPE_SAM_CONCEPTS = ["rock", "boulder", "landslide", "retaining wall", "tree", "water"] as const;

/** SAM areas per concept, normalised to a stable reference in the frame (code, no AI). */
export interface SignMetrics {
  /** "retaining wall" when the wall's box is the scale, else "image" (rough). */
  ref: "retaining wall" | "image";
  rough: boolean;
  concepts: Record<string, { count: number; areaPct: number; /** area ÷ reference area */ norm: number }>;
}

export interface SlopeCheckRecord extends SlopeCheck {
  by: ModelSource;
  readBy: ModelSource;
  /** Two different models looked at the photo (not a fallback to the same one, not rules). */
  twoModels: boolean;
  /** overall after the check (downgrades applied; reject → "none"). */
  finalOverall: SlopeReading["overall"];
}

export interface SlopeObservation {
  id: string;
  site_id: string;
  report_id: string | null;
  photo_id: string | null;
  reading: (SlopeReading & { by: ModelSource }) | null;
  check: SlopeCheckRecord | null;
  sign_metrics: SignMetrics | Record<string, never>;
  created_at: string;
  is_demo?: boolean;
  photos?: { public_url: string | null; annotated_url: string | null } | null;
}

/** Stored as slope_sites.risk — the latest assessment after code caps. */
export interface SlopeAssessment extends SlopeRisk {
  by: ModelSource | "code";
  /** What the model said before code capped it (null when not capped). */
  modelLevel: SlopeLevel | null;
  capNote: string | null;
  rain: { mm: number; maxHourlyMm: number; level: string; source: "forecast" | "replay"; replayDate?: string; wettestAt: string | null } | null;
  slides90d: number | null;
  changes: string[];
  trace: string[];
  at: string;
}

export interface SlopeHistoryItem {
  at: string;
  kind: "observation" | "risk" | "inspect" | "decay";
  text: string;
  actor?: string;
}

export interface SlopeSite {
  id: string;
  segment_id: string | null;
  road_ref: string | null;
  lat: number;
  lng: number;
  place_name: string | null;
  risk_level: SlopeLevel;
  risk: SlopeAssessment | null;
  history: SlopeHistoryItem[];
  last_observed_at: string | null;
  last_assessed_at: string | null;
  created_at: string;
  is_demo?: boolean;
}

/** Compact site for map markers / route rows. */
export interface SlopePin {
  id: string;
  lat: number;
  lng: number;
  place: string | null;
  road: string | null;
  level: SlopeLevel;
  headline: string | null;
  lastObservedAt: string | null;
  advice?: string | null;
  adviceHi?: string | null;
  rain?: { mm: number; level: string; wettestAt: string | null; source: "forecast" | "replay" } | null;
}

/** Risk-purple tokens only (CLAUDE.md 6B design rule): intensity grows with the level, the word is always shown. */
export const SLOPE_STYLE: Record<SlopeLevel, { bg: string; ink: string; dot: string }> = {
  none: { bg: "rgba(142,142,147,0.16)", ink: "#48484A", dot: "#8E8E93" },
  watch: { bg: "rgba(123,92,214,0.12)", ink: "#4A2F9A", dot: "#7B5CD6" },
  elevated: { bg: "rgba(123,92,214,0.22)", ink: "#4A2F9A", dot: "#7B5CD6" },
  high: { bg: "#7B5CD6", ink: "#FFFFFF", dot: "#4A2F9A" },
};
