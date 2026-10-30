// Drive Watch (Phase 6A): which hazards to announce, and what to say — pure code, no AI.
// Distances are ALONG the route (km), never straight-line.

export type Lang = "en" | "hi";

export interface DriveEvent {
  id: string;
  type: string;
  status: string;
  placeName: string | null;
  /** km along the chosen route */
  alongKm: number;
}

/** Announce at 5 km and again at 1 km. */
export const THRESHOLDS_KM = [1, 5] as const;
/** An event this far behind you is passed. */
const PASSED_KM = 0.3;

export interface Due {
  event: DriveEvent;
  thresholdKm: number;
  aheadKm: number;
}

/**
 * Events that just came within a threshold. `announced` holds `${id}:${km}` keys and is updated here,
 * so an alert never repeats; jumping straight inside 1 km also marks the 5 km one as done.
 */
export function dueAnnouncements(events: DriveEvent[], userKm: number, announced: Set<string>): Due[] {
  const due: Due[] = [];
  for (const e of events) {
    const ahead = e.alongKm - userKm;
    if (ahead < -PASSED_KM) continue;
    const t = THRESHOLDS_KM.find((k) => ahead <= k);
    if (t === undefined || announced.has(`${e.id}:${t}`)) continue;
    for (const k of THRESHOLDS_KM) if (k >= t) announced.add(`${e.id}:${k}`);
    due.push({ event: e, thresholdKm: t, aheadKm: Math.max(0, ahead) });
  }
  return due.sort((a, b) => a.aheadKm - b.aheadKm);
}

const WHAT: Record<string, { en: string; hi: string }> = {
  landslide: { en: "Landslide debris", hi: "भूस्खलन" },
  snow: { en: "Snow on the road", hi: "सड़क पर बर्फ़" },
  ice: { en: "Ice on the road", hi: "सड़क पर फिसलन भरी बर्फ़" },
  flood_water: { en: "Water on the road", hi: "सड़क पर पानी" },
  road_damage: { en: "Damaged road", hi: "सड़क टूटी हुई" },
  pothole: { en: "Potholes", hi: "गड्ढे" },
  traffic: { en: "Traffic jam", hi: "जाम" },
  accident: { en: "Accident", hi: "दुर्घटना" },
  closure_notice: { en: "Closure notice", hi: "सड़क बंद होने की सूचना" },
};
const STATUS: Record<string, { en: string; hi: string }> = {
  open: { en: "road open", hi: "सड़क खुली है" },
  slow: { en: "slow traffic", hi: "धीमा ट्रैफ़िक" },
  one_lane: { en: "one lane open", hi: "एक लेन खुली है" },
  closed: { en: "road closed", hi: "सड़क बंद है" },
  unknown: { en: "condition unclear", hi: "स्थिति साफ़ नहीं" },
};

function dist(km: number, lang: Lang): string {
  if (km < 0.95) {
    const m = Math.max(100, Math.round((km * 1000) / 100) * 100);
    return lang === "hi" ? `${m} मीटर` : `${m} metres`;
  }
  const k = km < 1.5 ? 1 : Math.round(km);
  return lang === "hi" ? `${k} किलोमीटर` : `${k} kilometre${k === 1 ? "" : "s"}`;
}

const what = (e: DriveEvent, lang: Lang) => (WHAT[e.type] ?? { en: "Road problem", hi: "सड़क पर रुकावट" })[lang];
const status = (s: string, lang: Lang) => (STATUS[s] ?? STATUS.unknown!)[lang];

/** "Landslide debris, one lane open, 4 kilometres ahead near Aut." / Hindi */
export function hazardMessage(e: DriveEvent, aheadKm: number, lang: Lang): string {
  const near = e.placeName;
  if (lang === "hi") return `आगे ${dist(aheadKm, "hi")} पर${near ? ` ${near} के पास` : ""} ${what(e, "hi")}, ${status(e.status, "hi")}।`;
  return `${what(e, "en")}, ${status(e.status, "en")}, ${dist(aheadKm, "en")} ahead${near ? ` near ${near}` : ""}.`;
}

export interface RouteChange {
  kind: "new" | "status" | "cleared";
  event: DriveEvent;
  was?: string;
}

/** Road Watch during the drive: compare the last known statuses with a fresh poll (ids on the route only). */
export function diffEvents(prev: Map<string, DriveEvent>, next: DriveEvent[]): RouteChange[] {
  const out: RouteChange[] = [];
  const seen = new Set<string>();
  for (const e of next) {
    seen.add(e.id);
    const old = prev.get(e.id);
    if (!old) out.push({ kind: "new", event: e });
    else if (old.status !== e.status) out.push({ kind: "status", event: e, was: old.status });
  }
  for (const [id, e] of prev) if (!seen.has(id)) out.push({ kind: "cleared", event: e });
  return out;
}

/** "Road Watch: new on your route — Landslide debris, road closed, 12 kilometres ahead near Aut." */
export function changeMessage(c: RouteChange, aheadKm: number, lang: Lang): string {
  const e = c.event;
  if (lang === "hi") {
    if (c.kind === "cleared") return `रोड वॉच: ${e.placeName ? `${e.placeName} के पास ` : ""}${what(e, "hi")} अब हट गया है।`;
    if (c.kind === "status") return `रोड वॉच: ${hazardMessage(e, aheadKm, "hi")} पहले: ${status(c.was ?? "unknown", "hi")}।`;
    return `रोड वॉच: आपके रास्ते पर नई सूचना। ${hazardMessage(e, aheadKm, "hi")}`;
  }
  if (c.kind === "cleared") return `Road Watch: ${what(e, "en").toLowerCase()}${e.placeName ? ` near ${e.placeName}` : ""} has cleared.`;
  if (c.kind === "status") return `Road Watch: changed. ${hazardMessage(e, aheadKm, "en")} It was ${status(c.was ?? "unknown", "en")}.`;
  return `Road Watch: new on your route. ${hazardMessage(e, aheadKm, "en")}`;
}

// ---------------------------------------------------------------- Slope Sentinel (Phase 6B)

/** Warn once within this distance of an elevated/high slope site. */
export const SLOPE_WARN_KM = 2;

export interface DriveSlope {
  id: string;
  placeName: string | null;
  level: string;
  alongKm: number;
}

/** Slope sites that just came within 2 km ahead (each once). */
export function dueSlopes(slopes: DriveSlope[], userKm: number, announced: Set<string>): { slope: DriveSlope; aheadKm: number }[] {
  const out: { slope: DriveSlope; aheadKm: number }[] = [];
  for (const s of slopes) {
    const ahead = s.alongKm - userKm;
    if (ahead < -PASSED_KM || ahead > SLOPE_WARN_KM || announced.has(`slope:${s.id}`)) continue;
    announced.add(`slope:${s.id}`);
    out.push({ slope: s, aheadKm: Math.max(0, ahead) });
  }
  return out;
}

/** "Unstable slope ahead near Aut. Don't stop for the next 2 kilometres." / Hindi */
export function slopeMessage(s: DriveSlope, lang: Lang): string {
  if (lang === "hi") return `आगे${s.placeName ? ` ${s.placeName} के पास` : ""} ढलान अस्थिर है। अगले ${SLOPE_WARN_KM} किलोमीटर तक न रुकें।`;
  return `Unstable slope ahead${s.placeName ? ` near ${s.placeName}` : ""}. Don't stop for the next ${SLOPE_WARN_KM} kilometres.`;
}
