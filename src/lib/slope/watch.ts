// Server-only: Road Watch for slopes (Phase 6B). A site rising to elevated/high on a watched trip's
// recommended route → one alert per trip per site level. Plain code (OSRM plan, cached), no AI.
import { insert, select } from "../db/supabase.ts";
import { cumulative, project, type Coord } from "../drive/line.ts";
import { planRoute } from "../geo/route.ts";
import { routeUrl, type PlacePoint } from "../watch/types.ts";
import { SLOPE_WORD, type SlopeSite } from "./types.ts";

const PAD = 0.05;
const ON_ROUTE_M = 300;

interface TripRow {
  id: string;
  user_id: string | null;
  from_place: PlacePoint;
  to_place: PlacePoint;
  depart_at: string | null;
  route_cache: { bbox?: [number, number, number, number] } | null;
}

export async function slopeWatchAlerts(site: SlopeSite): Promise<number> {
  const trips = await select<TripRow>("watched_trips", "select=id,user_id,from_place,to_place,depart_at,route_cache&active=is.true&limit=200");
  let sent = 0;
  for (const t of trips) {
    const b = t.route_cache?.bbox;
    if (!t.user_id || (b && !(site.lng >= b[0] - PAD && site.lng <= b[2] + PAD && site.lat >= b[1] - PAD && site.lat <= b[3] + PAD))) continue;
    const already = await select<{ id: string }>(
      "alerts",
      `select=id&user_id=eq.${t.user_id}&data->>slopeSiteId=eq.${site.id}&data->>level=eq.${site.risk_level}&data->>tripId=eq.${t.id}&limit=1`,
    );
    if (already.length) continue;
    const depart = t.depart_at && new Date(t.depart_at).getTime() > Date.now() ? new Date(t.depart_at) : new Date();
    const plan = await planRoute(t.from_place, t.to_place, depart).catch(() => null);
    const best = plan?.routes.find((r) => r.recommended) ?? plan?.routes[0];
    if (!best) continue;
    const coords = best.geometry.coordinates as Coord[];
    const p = project(coords, cumulative(coords), [site.lng, site.lat]);
    if (p.offKm * 1000 > ON_ROUTE_M) continue;
    const name = `${t.from_place.name} → ${t.to_place.name}`;
    const place = site.place_name ?? site.road_ref ?? "your route";
    await insert("alerts", {
      user_id: t.user_id,
      kind: "road_watch",
      title: `Unstable slope on your ${name} trip`,
      body: `${SLOPE_WORD[site.risk_level]} slope risk above the road near ${place} (km ${Math.round(p.alongKm)}). ${site.risk?.reasons?.[0] ?? ""} ${site.risk?.advice ?? ""}`.trim(),
      data: {
        tripId: t.id, trip: name, url: `/slope/${site.id}`, routeUrl: routeUrl(t.from_place, t.to_place, t.depart_at),
        slopeSiteId: site.id, level: site.risk_level, hi: site.risk?.adviceHi ?? undefined, by: site.risk?.by ?? "code",
      },
    });
    sent++;
  }
  return sent;
}
