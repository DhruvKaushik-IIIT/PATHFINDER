// Client-safe: the whole-state defaults. Pathfinder is for all of Himachal, so no screen
// defaults to one town (Nov 1). Plus small per-device memories (localStorage, best-effort).

/** Himachal Pradesh, a little inset so the outline fills a phone screen. [[W,S],[E,N]] */
export const HP_BOUNDS: [[number, number], [number, number]] = [
  [75.6, 30.4],
  [78.9, 33.2],
];
/** Centre + zoom that shows most of the state before fitBounds runs. */
export const HP_VIEW = { latitude: 31.85, longitude: 77.25, zoom: 6.6 };

/** Quick picks on Nearby when we don't know where you are (most-visited places, spread over the state). */
export const POPULAR_PLACES = [
  { name: "Manali", lat: 32.243, lng: 77.189 },
  { name: "Shimla", lat: 31.104, lng: 77.173 },
  { name: "Dharamshala", lat: 32.219, lng: 76.323 },
  { name: "Kullu", lat: 31.957, lng: 77.109 },
  { name: "Kasol", lat: 32.01, lng: 77.315 },
  { name: "Dalhousie", lat: 32.536, lng: 75.971 },
] as const;

export type View = { latitude: number; longitude: number; zoom: number };
export type SavedPlace = { name: string; lat: number; lng: number };

const VIEW_KEY = "pf:lastView";
const PLACE_KEY = "pf:nearbyPlace";

function read<T>(key: string, ok: (v: T) => boolean): T | null {
  try {
    if (typeof window === "undefined") return null;
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
    return v && ok(v) ? v : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode / blocked storage: just don't remember */
  }
}

const inNorthIndia = (lat: number, lng: number) => lat >= 26 && lat <= 35 && lng >= 72 && lng <= 82;

/** Where the Home map was last time on this phone. */
export const loadLastView = () =>
  read<View>(VIEW_KEY, (v) => Number.isFinite(v.zoom) && inNorthIndia(v.latitude, v.longitude));
export const saveLastView = (v: View) =>
  write(VIEW_KEY, { latitude: +v.latitude.toFixed(4), longitude: +v.longitude.toFixed(4), zoom: +v.zoom.toFixed(2) });

/** The place last picked on Nearby when location was off. */
export const loadNearbyPlace = () => read<SavedPlace>(PLACE_KEY, (p) => typeof p.name === "string" && inNorthIndia(p.lat, p.lng));
export const saveNearbyPlace = (p: SavedPlace) => write(PLACE_KEY, p);

/** Is location already allowed? (Never prompts. Unknown → false.) */
export async function locationAllowed(): Promise<boolean> {
  try {
    if (!("geolocation" in navigator) || !navigator.permissions) return false;
    return (await navigator.permissions.query({ name: "geolocation" })).state === "granted";
  } catch {
    return false;
  }
}

/** Below this zoom the map shows a region, not a place — Nearby asks instead of guessing. */
export const PLACE_ZOOM = 9;
