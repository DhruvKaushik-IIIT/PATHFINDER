// Client-safe shapes for "Can my vehicle cross?" (Phase 6C).
export interface Range {
  min: number;
  max: number;
}

export type FitVerdict = "fits" | "tight" | "wont_fit" | "unknown";
/** Lower = worse. The AI may move the verdict DOWN this order, never up. */
export const FIT_RANK: Record<FitVerdict, number> = { wont_fit: 0, unknown: 1, tight: 2, fits: 3 };

export const FIT_STYLE: Record<FitVerdict, { word: string; bg: string; ink: string; dot: string }> = {
  fits: { word: "Fits", bg: "rgba(52,199,89,0.16)", ink: "#1A6B35", dot: "#1E7B45" },
  tight: { word: "Tight", bg: "rgba(255,159,10,0.20)", ink: "#8A4300", dot: "#C25E00" },
  wont_fit: { word: "Won't fit", bg: "rgba(255,59,48,0.14)", ink: "#A1251C", dot: "#B3261E" },
  unknown: { word: "Unknown", bg: "rgba(142,142,147,0.16)", ink: "#48484A", dot: "#8E8E93" },
};

/** The traveller's vehicle as the maths sees it (from the spec table, or a category range). */
export interface VehicleProfile {
  /** data/vehicles.json id, or null for a category. */
  vehicleId: string | null;
  category: string;
  name: string;
  /** Body width (m), a range for categories. */
  widthM: Range;
  /** Estimated total mirror allowance (both sides); 0 for bikes. */
  mirrorsM: number;
  lengthM: Range;
  clearanceMm: Range | null;
  fourByFour: boolean;
  roofLoad: boolean;
  source: "spec" | "category";
  specUrl: string | null;
}

/** What the road photos say (code, from the event's SAM measurements). */
export interface RoadSide {
  type: string;
  status: string;
  /** Width of road left open (m), null when the photos don't show it. */
  gapM: Range | null;
  totalM: number | null;
  /** Age of the newest road photo / report (h); null = no photo. */
  photoAgeH: number | null;
  /** Valley-side / collapsed edge on the open side → +0.3 m safety. */
  edgeRisk: boolean;
}

export interface FitResult {
  verdict: FitVerdict;
  headline: string;
  widthWithMirrorsM: Range;
  /** Gap needed: width with mirrors + safety margins (upper end of the width range). */
  neededM: number;
  safetyM: number;
  gapM: Range | null;
  /** Without mirrors it would fit: "fold mirrors" advice. */
  foldMirrorsHelps: boolean;
  /** Why the verdict was capped (old photo, closed road…). */
  caps: string[];
  lengthNote: string | null;
}
