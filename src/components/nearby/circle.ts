// Client-safe: a radius circle as a GeoJSON polygon (no Turf in the browser bundle).
import type { Feature, Polygon } from "geojson";

export function circle(lat: number, lng: number, radiusKm: number, steps = 72): Feature<Polygon> {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}
