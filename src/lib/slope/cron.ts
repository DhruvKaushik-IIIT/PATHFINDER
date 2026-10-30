// Server-only: daily Slope Sentinel sweep (Phase 6B, /api/cron/slope-watch). Plain code first:
//   1. decay: no new photo for 72 h → at most "watch" (no AI);
//   2. forecast check per site (Open-Meteo, no AI) → only when it turns moderate+ AND the last
//      assessment didn't already see that rain does the risk agent run (5.4: no AI when nothing changed);
//   3. rain coming + no photo in 24 h → a scout request for a newer slope photo.
import { select } from "../db/supabase.ts";
import { pointRisk } from "../risk/forecast.ts";
import { RISK_RANK, type RiskLevel } from "../risk/types.ts";
import { dispatchRequest, ensureSlopeRequest } from "../scout/requests.ts";
import { assessSite, decaySite } from "./assess.ts";
import type { SlopeSite } from "./types.ts";

const SITE_COLS = "id,segment_id,road_ref,lat,lng,place_name,risk_level,risk,history,last_observed_at,last_assessed_at,created_at,is_demo";
const hAgo = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);

export interface SweepRow {
  siteId: string;
  place: string | null;
  rain: RiskLevel | null;
  decayed: boolean;
  assessed: boolean;
  level: string;
  scout?: string;
  skipped?: string;
}

export async function sweepSlopes(opts: { replay?: boolean; budgetMs?: number; limit?: number } = {}): Promise<SweepRow[]> {
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const since = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();
  const sites = await select<SlopeSite>("slope_sites", `select=${SITE_COLS}&or=(risk_level.neq.none,last_observed_at.gte.${since})&order=last_observed_at.desc&limit=${opts.limit ?? 40}`);
  const out: SweepRow[] = [];
  for (const site of sites) {
    if (Date.now() > deadline) break;
    const row: SweepRow = { siteId: site.id, place: site.place_name, rain: null, decayed: false, assessed: false, level: site.risk_level };
    row.decayed = await decaySite(site);
    if (row.decayed) site.risk_level = row.level = "watch";
    const rain = await pointRisk(site.lat, site.lng, 24, { replay: opts.replay }).catch(() => null);
    row.rain = rain?.level ?? null;
    const wet = rain && RISK_RANK[rain.level] >= 2;
    const seen = (site.risk?.rain?.level ?? "none") as RiskLevel;
    if (wet && (RISK_RANK[rain.level] > RISK_RANK[seen] || hAgo(site.last_assessed_at) > 20)) {
      const a = await assessSite(site.id, { trigger: `the rain forecast turned ${rain.level} (~${rain.rainMm} mm in 24 h)`, replay: opts.replay, site });
      row.assessed = Boolean(a);
      if (a) row.level = a.level;
    } else row.skipped = wet ? "rain already assessed" : "dry — no AI";
    if (wet && hAgo(site.last_observed_at) > 24) {
      const req = await ensureSlopeRequest(site, `Heavy rain is forecast near ${site.place_name ?? "this road"} tonight. Can you photograph the hillside above the road?`);
      const d = await dispatchRequest(req);
      row.scout = d.sent ? `sent to ${d.sent}` : (d.skipped ?? "none sent");
    }
    out.push(row);
  }
  return out;
}
