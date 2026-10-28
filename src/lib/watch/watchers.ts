// Server-only: who is watching a trip through this spot (advisory reach, scout requests). Plain code.
import { select } from "../db/supabase.ts";

/** Active watched trips that pass this event (listed in their snapshot, or their route box around it). */
export async function watchers(e: { id: string; lat: number; lng: number }): Promise<{ userIds: string[]; trips: number }> {
  const rows = await select<{ user_id: string; route_cache: { bbox?: [number, number, number, number]; events?: { id: string }[] } | null }>(
    "watched_trips",
    "select=user_id,route_cache&active=is.true&limit=2000",
  );
  const pad = 0.05;
  const hit = rows.filter((r) => {
    const c = r.route_cache;
    if (c?.events?.some((x) => x.id === e.id)) return true;
    const b = c?.bbox;
    return Boolean(b && e.lng >= b[0] - pad && e.lng <= b[2] + pad && e.lat >= b[1] - pad && e.lat <= b[3] + pad);
  });
  return { userIds: [...new Set(hit.map((r) => r.user_id))], trips: hit.length };
}
