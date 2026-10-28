// Client-safe event shapes + display helpers (no server imports here).
export type EventStatus = "open" | "slow" | "one_lane" | "closed" | "unknown";

export interface MapEvent {
  id: string;
  type: string;
  status: EventStatus;
  placeName: string | null;
  roadRef: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  confidence: number;
  lastConfirmedAt: string;
  reports: number;
  modelsAgreed: number | null;
  photoUrl: string | null;
}

// CLAUDE.md 7.2 — status is ALWAYS word + colour.
export const STATUS_STYLE: Record<EventStatus, { dot: string; bg: string; ink: string; word: string }> = {
  open: { dot: "#1E7B45", bg: "rgba(52,199,89,0.16)", ink: "#1A6B35", word: "Open" },
  slow: { dot: "#C25E00", bg: "rgba(255,159,10,0.20)", ink: "#8A4300", word: "Slow" },
  one_lane: { dot: "#C25E00", bg: "rgba(255,159,10,0.20)", ink: "#8A4300", word: "One lane" },
  closed: { dot: "#B3261E", bg: "rgba(255,59,48,0.14)", ink: "#A1251C", word: "Closed" },
  unknown: { dot: "#8E8E93", bg: "rgba(142,142,147,0.16)", ink: "#48484A", word: "Unclear" },
};

export const TYPE_WORD: Record<string, string> = {
  landslide: "Landslide",
  snow: "Snow",
  ice: "Ice",
  flood_water: "Water on road",
  road_damage: "Road damage",
  pothole: "Potholes",
  traffic: "Traffic jam",
  accident: "Accident",
  closure_notice: "Closure notice",
  clear: "Road clear",
  other: "Road issue",
};

/** "just now" · "12 min ago" · "3 h ago" · "2 d ago" */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
