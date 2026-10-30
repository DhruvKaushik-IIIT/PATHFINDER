// Server-only: slope sites + observations in Supabase (migration 0003). A new photo within ~300 m of a
// site on the same road segment joins it; otherwise it starts a new site.
import { insert, select, update } from "../db/supabase.ts";
import { cumulative, project, type Coord } from "../drive/line.ts";
import { distanceM } from "../geo/snap.ts";
import type { SlopeHistoryItem, SlopeObservation, SlopePin, SlopeSite } from "./types.ts";

export const SITE_RADIUS_M = 300;
const HISTORY_MAX = 30;
const SITE_COLS = "id,segment_id,road_ref,lat,lng,place_name,risk_level,risk,history,last_observed_at,last_assessed_at,created_at,is_demo";
const OBS_COLS = "id,site_id,report_id,photo_id,reading,check,sign_metrics,created_at,is_demo,photos(public_url,annotated_url)";

export async function findSite(lat: number, lng: number, segmentId: string | null): Promise<SlopeSite | null> {
  const d = 0.004;
  const rows = await select<SlopeSite>(
    "slope_sites",
    `select=${SITE_COLS}&lat=gte.${lat - d}&lat=lte.${lat + d}&lng=gte.${lng - d}&lng=lte.${lng + d}&limit=20`,
  );
  return (
    rows
      .filter((s) => (s.segment_id ?? null) === (segmentId ?? null) || !segmentId || !s.segment_id)
      .map((s) => ({ s, m: distanceM(lat, lng, s.lat, s.lng) }))
      .filter((x) => x.m <= SITE_RADIUS_M)
      .sort((a, b) => a.m - b.m)[0]?.s ?? null
  );
}

export async function createSite(row: { lat: number; lng: number; segment_id: string | null; road_ref: string | null; place_name: string | null; is_demo?: boolean }): Promise<SlopeSite> {
  const [s] = await insert<SlopeSite>("slope_sites", { ...row, history: [] });
  return s!;
}

export async function getSite(id: string): Promise<SlopeSite | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [s] = await select<SlopeSite>("slope_sites", `select=${SITE_COLS}&id=eq.${id}`);
  return s ?? null;
}

export function siteObservations(siteId: string, limit = 10): Promise<SlopeObservation[]> {
  return select<SlopeObservation>("slope_observations", `select=${OBS_COLS}&site_id=eq.${siteId}&order=created_at.desc&limit=${limit}`);
}

/** Append to the site's small timeline (newest last, capped). */
export async function addHistory(site: Pick<SlopeSite, "id" | "history">, item: SlopeHistoryItem, patch: Record<string, unknown> = {}): Promise<SlopeHistoryItem[]> {
  const history = [...(site.history ?? []), item].slice(-HISTORY_MAX);
  await update("slope_sites", `id=eq.${site.id}`, { history, ...patch });
  return history;
}

export function toPin(s: SlopeSite): SlopePin {
  return {
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    place: s.place_name,
    road: s.road_ref,
    level: s.risk_level,
    headline: s.risk?.reasons?.[0] ?? null,
    lastObservedAt: s.last_observed_at,
  };
}

/** Sites with any warning (watch+) inside a bbox, for map markers. */
export async function sitesInBbox(w: number, s: number, e: number, n: number): Promise<SlopeSite[]> {
  return select<SlopeSite>(
    "slope_sites",
    `select=${SITE_COLS}&risk_level=neq.none&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}&order=last_observed_at.desc&limit=200`,
  );
}

export interface SlopeOnRoute extends SlopePin {
  /** km from the start of the route. */
  km: number;
}

/** Sites within `maxM` of a route line (watch+), in route order. */
export async function sitesOnLine(coords: Coord[], maxM = 300): Promise<SlopeOnRoute[]> {
  if (coords.length < 2) return [];
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const pad = 0.01;
  const sites = await sitesInBbox(Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad).catch(() => []);
  const cum = cumulative(coords);
  return sites
    .map((s) => ({ s, p: project(coords, cum, [s.lng, s.lat]) }))
    .filter((x) => x.p.offKm * 1000 <= maxM)
    .sort((a, b) => a.p.alongKm - b.p.alongKm)
    .map((x) => ({ ...toPin(x.s), km: Math.round(x.p.alongKm * 10) / 10 }));
}
