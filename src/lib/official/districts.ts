// Client-safe: the area each district office looks after. Our road segments carry no district yet
// (OSM ways have none), so a district is an approximate circle around its main road network.
// TODO(phase-6): real district polygons if time allows.
export interface District {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export const DISTRICTS: District[] = [
  { name: "Mandi", lat: 31.7, lng: 77.0, radiusKm: 30 }, // Mandi town, Sundernagar, Pandoh, Aut, Kataula, Jhiri (not Kullu/Jalori)
  { name: "Kullu", lat: 32.08, lng: 77.15, radiusKm: 40 }, // Bhuntar → Manali → Solang
  { name: "Lahaul-Spiti", lat: 32.5, lng: 77.15, radiusKm: 45 }, // Atal Tunnel north, Sissu, Keylong
  { name: "Shimla", lat: 31.15, lng: 77.35, radiusKm: 45 },
  { name: "Kangra", lat: 32.1, lng: 76.3, radiusKm: 45 },
];

export function districtOf(name: string | null | undefined): District {
  return DISTRICTS.find((d) => d.name.toLowerCase() === (name ?? "").toLowerCase()) ?? DISTRICTS[0]!;
}

/** W,S,E,N box around the district circle. */
export function districtBbox(d: District): [number, number, number, number] {
  const dLat = d.radiusKm / 111;
  const dLng = d.radiusKm / (111 * Math.cos((d.lat * Math.PI) / 180));
  return [d.lng - dLng, d.lat - dLat, d.lng + dLng, d.lat + dLat];
}

export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const kx = 111 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 111);
}
