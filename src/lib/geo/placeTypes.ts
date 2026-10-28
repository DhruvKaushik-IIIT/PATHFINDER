// Client-safe place shape for search results and route endpoints.
export interface Place {
  id: string;
  name: string;
  /** "Town · Himachal Pradesh", "Pass · Kullu", "City · Delhi" */
  subtitle: string;
  lat: number;
  lng: number;
  source: "pathfinder" | "photon";
}

/** "31.7083,76.9320" ↔ {lat,lng}; names travel separately in the URL. */
export function toParam(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}
