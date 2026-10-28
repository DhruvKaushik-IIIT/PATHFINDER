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
  /** News items backing it; reports === 0 && news > 0 → "from news, not yet confirmed". */
  news: number;
  modelsAgreed: number | null;
  photoUrl: string | null;
  etaClear?: { earliest: string; latest: string } | null;
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

const AT_TYPES = new Set(["landslide", "snow", "ice", "flood_water", "road_damage", "accident"]);
/** "Landslide at Kataula" · "Traffic jam near Pandoh" */
export function eventTitle(type: string, place: string | null): string {
  const what = TYPE_WORD[type] ?? "Road issue";
  return place ? `${what} ${AT_TYPES.has(type) ? "at" : "near"} ${place}` : what;
}

/** "just now" · "12 min ago" · "3 h ago" · "2 d ago" */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export interface Range {
  min: number;
  max: number;
}

export interface EventPhoto {
  id: string;
  publicUrl: string | null;
  annotatedUrl: string | null;
  createdAt: string;
  source: string;
  facesBlurred: boolean;
  width: number | null;
  height: number | null;
}

export interface TimelineItem {
  at: string;
  kind: string;
  text: string;
  actor: string | null;
}

/** GET /api/events/[id] — everything the detail + photo screens show. */
export interface EventDetail extends MapEvent {
  passable: { bike: boolean | null; car: boolean | null; bus: boolean | null };
  measurements: {
    blockedLengthM?: Range | null;
    roadWidthLeftM?: Range | null;
    roadTotalWidthM?: Range | number | null;
    blockedPct?: Range | null;
    debrisVolumeM3?: Range | null;
    vehiclesVisible?: number | null;
  };
  etaClear: { earliest: string; latest: string } | null;
  summaryHi: string | null;
  startedAt: string;
  resolvedAt: string | null;
  sources: { reports: number; official: number; news: number; notices: number };
  photos: EventPhoto[];
  timeline: TimelineItem[];
}

/** GET /api/nearby — one ranked event within the radius. */
export interface NearbyItem extends MapEvent {
  distanceKm: number;
  /** Ranking score (severity × confidence × proximity × freshness), higher first. */
  score: number;
}

export interface NearbyResult {
  center: { lat: number; lng: number; name: string };
  radiusKm: number;
  counts: { closed: number; oneLane: number; slow: number; other: number };
  items: NearbyItem[];
  summary: string;
  summaryHi: string | null;
  /** "baseten" / "meta" when an AI wrote the summary; "code" for the template. */
  summaryBy: string;
}
