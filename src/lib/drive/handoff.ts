// "Pathfinder decides the safe route, Google Maps drives it." (Phase 6A) — pure code, no AI, no key.
// Google Maps URLs: up to 3 waypoints work in mobile browsers (9 elsewhere), pipe-separated, and
// commas/pipes must be URL-encoded (developers.google.com/maps/documentation/urls/get-started).
import { cumulative, pointAt, project, type Coord } from "./line.ts";

export const MAX_WAYPOINTS = 3; // the mobile-browser limit, so one link works everywhere

const DIVERGE_KM = 1; // the chosen road is this far from another option's road → a different road
const MIN_STRETCH_KM = 2; // ignore tiny wiggles (parallel carriageways, simplification)
const END_GAP_KM = 2; // a waypoint right next to the start/end adds nothing

export interface Waypoint {
  lat: number;
  lng: number;
  /** km along the chosen route */
  km: number;
  /** length of the stretch where the chosen route leaves the other options (km) */
  stretchKm: number;
}

/**
 * Waypoints at the key decision points: where Pathfinder's chosen route leaves the other route
 * options (OSRM's alternatives, incl. the blocked default), not evenly spaced. Each waypoint sits at
 * the point of the divergent stretch farthest from the other road, so Google can't shortcut it.
 * Smallest set that forces the route: longest stretches first, at most MAX_WAYPOINTS, in route order.
 * Limit: Google's own default could differ from every OSRM option; we can't see it without its API.
 */
export function pickWaypoints(chosen: Coord[], others: Coord[][], max = MAX_WAYPOINTS): Waypoint[] {
  if (chosen.length < 2 || !others.length) return [];
  const cum = cumulative(chosen);
  const total = cum[cum.length - 1]!;
  const step = Math.max(0.5, total / 800);
  const othersCum = others.map(cumulative);

  const candidates: Waypoint[] = [];
  others.forEach((other, oi) => {
    let run: { start: number; peak: { km: number; off: number } } | null = null;
    const close = (endKm: number) => {
      if (run && endKm - run.start >= MIN_STRETCH_KM) {
        const [lng, lat] = pointAt(chosen, cum, run.peak.km);
        candidates.push({ lat, lng, km: run.peak.km, stretchKm: endKm - run.start });
      }
      run = null;
    };
    for (let km = 0; km <= total; km += step) {
      const p = pointAt(chosen, cum, km);
      const off = project(other, othersCum[oi]!, p).offKm;
      if (off > DIVERGE_KM) {
        if (!run) run = { start: km, peak: { km, off } };
        else if (off > run.peak.off) run.peak = { km, off };
      } else close(km);
    }
    close(total);
  });

  // The same detour found against several alternatives → keep one (the longest stretch).
  const picked: Waypoint[] = [];
  for (const c of candidates.sort((a, b) => b.stretchKm - a.stretchKm)) {
    if (c.km < END_GAP_KM || c.km > total - END_GAP_KM) continue;
    if (picked.some((p) => Math.abs(p.km - c.km) < 5)) continue;
    picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.sort((a, b) => a.km - b.km);
}

const ll = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/** Google Maps directions deep link that follows the chosen route (opens the app on phones). */
export function googleMapsUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }, waypoints: Waypoint[]): string {
  const q = new URLSearchParams({ api: "1", origin: ll(from), destination: ll(to), travelmode: "driving" });
  if (waypoints.length) q.set("waypoints", waypoints.map(ll).join("|"));
  // URLSearchParams encodes "," → %2C and "|" → %7C, as Google requires.
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Apple Maps: start + end only (no reliable waypoint support → the UI warns about it). */
export function appleMapsUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return `https://maps.apple.com/?${new URLSearchParams({ saddr: ll(from), daddr: ll(to), dirflg: "d" })}`;
}
