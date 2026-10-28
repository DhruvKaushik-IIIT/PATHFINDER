// Client-safe shapes for Risk Forecast v1 (rain/snow forecast × recent slide history).
import type { MultiPolygon, Polygon } from "geojson";

export type RiskLevel = "none" | "low" | "moderate" | "high";

export const RISK_RANK: Record<RiskLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

export interface RiskStats {
  /** Total forecast rain in the window, mm. */
  rainMm: number;
  /** Wettest single hour, mm. */
  maxHourlyMm: number;
  maxChancePct: number;
  snowCm: number;
  /** Landslides / road damage / water on road within ~3 km in the last 90 days. */
  slidesNearby: number;
}

export interface RiskStretch extends RiskStats {
  level: RiskLevel;
  kind: "rain" | "snow";
  fromKm: number;
  toKm: number;
  place: string | null;
  /** When you'd be on this stretch (ISO). */
  startAt: string;
  endAt: string;
  polygon: Polygon | MultiPolygon;
}

export interface RouteRisk {
  level: RiskLevel;
  stretches: RiskStretch[];
  /** "Heavy rain risk near Aut–Bajaura (km 85–110) · ~18 mm around 2–4 AM · 3 slides here in 90 days" */
  headline: string | null;
  /** One calm line when there's no banner: "Dry along the route" / "Light rain possible near Kullu". */
  weatherLine: string;
  source: "forecast" | "replay";
  replayDate?: string;
  checkedAt: string;
}

export interface RiskCell extends RiskStats {
  level: RiskLevel;
  kind: "rain" | "snow";
  lat: number;
  lng: number;
  polygon: Polygon | MultiPolygon;
}

export interface AreaRisk {
  level: RiskLevel;
  cells: RiskCell[];
  headline: string;
  source: "forecast" | "replay";
  replayDate?: string;
  checkedAt: string;
}

export const RISK_WORD: Record<RiskLevel, string> = { none: "No rain risk", low: "Light rain", moderate: "Rain risk", high: "Heavy rain risk" };

/** "2025-08-13" → "13 Aug 2025" */
export function replayLabel(date?: string): string {
  if (!date) return "a past day";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
