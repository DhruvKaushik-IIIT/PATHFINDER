// Client-safe geometry along a route line (Phase 6A): no turf in the browser bundle.
// Coordinates are GeoJSON [lng, lat]. Distances in km, accurate to well under 1% at these scales.

export type Coord = [number, number];

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distKm(a: Coord, b: Coord): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative km at each vertex (cum[0] = 0, last = route length). */
export function cumulative(coords: Coord[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + distKm(coords[i - 1]!, coords[i]!));
  return cum;
}

/** Nearest point on the line: how far along it is (km) and how far off it the point is (km). */
export function project(coords: Coord[], cum: number[], p: Coord): { alongKm: number; offKm: number } {
  let best = { alongKm: 0, offKm: Infinity };
  // Local flat projection around p (km per degree).
  const kx = 111.32 * Math.cos(rad(p[1]));
  const ky = 110.57;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const ax = (a[0] - p[0]) * kx;
    const ay = (a[1] - p[1]) * ky;
    const bx = (b[0] - p[0]) * kx;
    const by = (b[1] - p[1]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.offKm) best = { alongKm: cum[i]! + t * (cum[i + 1]! - cum[i]!), offKm: off };
  }
  return best;
}

/** The point `km` along the line (clamped to its ends). */
export function pointAt(coords: Coord[], cum: number[], km: number): Coord {
  if (km <= 0) return coords[0]!;
  const total = cum[cum.length - 1]!;
  if (km >= total) return coords[coords.length - 1]!;
  let i = 1;
  while (cum[i]! < km) i++;
  const t = (km - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
  const a = coords[i - 1]!;
  const b = coords[i]!;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}
