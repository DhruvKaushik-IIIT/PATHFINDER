// Server-only: "Slopes to inspect" for the Command Centre (Phase 6B). Plain code, no AI:
// sites in the official's district at watch+, ranked by level × traffic on the road below.
import { select } from "../db/supabase.ts";
import { districtBbox, districtOf, kmBetween } from "../official/districts.ts";
import { vehiclesPerDayOf } from "../official/impact.ts";
import { addHistory, getSite, sitesInBbox, toPin } from "./sites.ts";
import { SLOPE_RANK, type SlopePin } from "./types.ts";

export interface SlopeToInspect extends SlopePin {
  vehiclesPerDay: number;
  score: number;
  inspectSentAt: string | null;
}

export async function slopesToInspect(districtName: string | null): Promise<SlopeToInspect[]> {
  const d = districtOf(districtName);
  const sites = (await sitesInBbox(...districtBbox(d))).filter((s) => kmBetween(d, s) <= d.radiusKm);
  const segIds = [...new Set(sites.map((s) => s.segment_id).filter(Boolean))] as string[];
  const segs = segIds.length
    ? await select<{ id: string; highway: string | null }>("road_segments", `select=id,highway&id=in.(${segIds.map((x) => `"${x}"`).join(",")})`)
    : [];
  const hw = new Map(segs.map((s) => [s.id, s.highway]));
  return sites
    .map((s) => {
      const vpd = vehiclesPerDayOf(s.segment_id ? hw.get(s.segment_id) : null);
      const inspect = [...(s.history ?? [])].reverse().find((h) => h.kind === "inspect");
      return { ...toPin(s), vehiclesPerDay: vpd, score: SLOPE_RANK[s.risk_level] ** 2 * vpd, inspectSentAt: inspect?.at ?? null };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

/** "Send crew to inspect": a timeline item only (no crew assignment, no status change). */
export async function sendInspection(siteId: string, org: string, district: string | null): Promise<boolean> {
  const site = await getSite(siteId);
  if (!site) return false;
  const d = districtOf(district);
  if (kmBetween(d, site) > d.radiusKm) return false;
  await addHistory(site, { at: new Date().toISOString(), kind: "inspect", text: `${org} sent a crew to inspect the slope`, actor: org });
  return true;
}
