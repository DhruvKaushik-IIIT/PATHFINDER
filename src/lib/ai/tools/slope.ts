// Server-only: tools for the Slope risk agent (Phase 6B). All plain code: the site, its checked
// photo readings + change metrics, Open-Meteo rain (or the replay day), slide history and traffic.
import type OpenAI from "openai";
import { z } from "zod";
import { select } from "../../db/supabase.ts";
import { distanceM } from "../../geo/snap.ts";
import { vehiclesPerDayOf } from "../../official/impact.ts";
import { pointRisk } from "../../risk/forecast.ts";
import { changeLines, keptSigns } from "../../slope/metrics.ts";
import type { SlopeObservation, SlopeSite } from "../../slope/types.ts";
import { SlopeRisk } from "../schemas.ts";
import { ist } from "./routeCheck.ts";

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

export interface SlopeToolContext {
  site: SlopeSite;
  observations: SlopeObservation[];
  replay: boolean;
  /** Filled by the tools so the caller can store what the agent saw. */
  seen: { rain?: Awaited<ReturnType<typeof pointRisk>> | null; slides90d?: number };
}

const fn = (name: string, description: string, parameters: Record<string, unknown>): Tool => ({
  type: "function",
  function: { name, description, parameters },
});
const none = { type: "object", properties: {}, required: [], additionalProperties: false };
const submitSchema = (() => {
  const s = { ...(z.toJSONSchema(SlopeRisk) as Record<string, unknown>) };
  delete s.$schema;
  return s;
})();

export const SLOPE_TOOLS: Tool[] = [
  fn("get_slope_site", "The slope site: place, road, current risk level, when it was last photographed and assessed.", none),
  fn("get_observations", "Photos of this slope, newest first: signs each model read (kind, severity, fresh?), the second model's check, and code-measured change between photos (approximate).", none),
  fn("get_rain_forecast", "Rain/snow forecast at the site for the next 24 hours (Open-Meteo), with a none/low/moderate/high level.", none),
  fn("get_event_history", "Landslides / road damage / water on road on this road segment or within 3 km in the last 90 days.", none),
  fn("get_segment_info", "The road below the slope: reference, class and rough traffic per day.", none),
  fn("submit_risk", "Submit your assessment. Call exactly once, at the end.", submitSchema),
];

const hAgo = (iso: string | null) => (iso ? Math.round(((Date.now() - new Date(iso).getTime()) / 3_600_000) * 10) / 10 : null);

/** Slides within 3 km (or on the same segment) started in the last 90 days. */
export async function slideHistory(site: Pick<SlopeSite, "lat" | "lng" | "segment_id">) {
  const since = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();
  const d = 0.03;
  const rows = await select<{ id: string; type: string; status: string; place_name: string | null; lat: number; lng: number; segment_id: string | null; started_at: string; resolved_at: string | null }>(
    "events",
    `select=id,type,status,place_name,lat,lng,segment_id,started_at,resolved_at&type=in.(landslide,road_damage,flood_water)&started_at=gte.${since}` +
      `&lat=gte.${site.lat - d}&lat=lte.${site.lat + d}&lng=gte.${site.lng - d}&lng=lte.${site.lng + d}&limit=50`,
  ).catch(() => []);
  return rows.filter((r) => (site.segment_id && r.segment_id === site.segment_id) || distanceM(site.lat, site.lng, r.lat, r.lng) < 3000);
}

/** Runs one tool call. Never throws: errors come back as text the model can recover from. */
export async function runSlopeTool(ctx: SlopeToolContext, name: string, _args: string): Promise<unknown> {
  const site = ctx.site;
  try {
    switch (name) {
      case "get_slope_site":
        return {
          siteId: site.id,
          place: site.place_name,
          road: site.road_ref,
          lat: site.lat,
          lng: site.lng,
          currentLevel: site.risk_level,
          lastPhotoHoursAgo: hAgo(site.last_observed_at),
          lastAssessedHoursAgo: hAgo(site.last_assessed_at),
          photos: ctx.observations.length,
        };
      case "get_observations":
        return {
          observations: ctx.observations.slice(0, 6).map((o) => ({
            at: ist(o.created_at),
            hoursAgo: hAgo(o.created_at),
            readBy: o.reading?.by ?? null,
            overall: o.check?.finalOverall ?? o.reading?.overall ?? null,
            signs: (o.reading?.signs ?? []).map((s) => ({ kind: s.kind, severity: s.severity, fresh: s.looksFresh, aboveRoad: s.aboveRoad, note: s.note })),
            keptAfterCheck: keptSigns(o),
            check: o.check ? { by: o.check.by, verdict: o.check.verdict, twoModels: o.check.twoModels, reasoning: o.check.reasoning } : null,
            summary: o.reading?.summary ?? null,
          })),
          changeBetweenPhotos: changeLines(ctx.observations),
          note: "Photo comparisons are approximate: photos differ in angle and zoom.",
        };
      case "get_rain_forecast": {
        const r = await pointRisk(site.lat, site.lng, 24, { replay: ctx.replay }).catch(() => null);
        ctx.seen.rain = r;
        if (!r) return { error: "forecast unavailable right now — don't rely on rain" };
        return {
          next24h: { rainMm: r.rainMm, wettestHourMm: r.maxHourlyMm, maxChancePct: r.maxChancePct, snowCm: r.snowCm },
          level: r.level,
          wettestAt: r.wettestAt ? ist(r.wettestAt) : null,
          source: r.source === "replay" ? `replay of real rain from ${r.replayDate} (demo)` : "Open-Meteo forecast",
        };
      }
      case "get_event_history": {
        const rows = await slideHistory(site);
        ctx.seen.slides90d = rows.length;
        return {
          count90d: rows.length,
          events: rows.slice(0, 8).map((r) => ({
            type: r.type, place: r.place_name, started: ist(r.started_at), stillOpen: !r.resolved_at,
            kmAway: Math.round(distanceM(site.lat, site.lng, r.lat, r.lng) / 100) / 10,
          })),
        };
      }
      case "get_segment_info": {
        if (!site.segment_id) return { road: site.road_ref, roadClass: null, vehiclesPerDay: vehiclesPerDayOf(null), note: "not on a mapped segment" };
        const [seg] = await select<{ road_ref: string | null; road_name: string | null; highway: string | null }>(
          "road_segments",
          `select=road_ref,road_name,highway&id=eq.${encodeURIComponent(site.segment_id)}`,
        );
        return { road: seg?.road_ref ?? seg?.road_name ?? site.road_ref, roadClass: seg?.highway ?? null, vehiclesPerDay: vehiclesPerDayOf(seg?.highway), note: "rough traffic estimate by road class" };
      }
      default:
        return { error: `unknown tool ${name}` };
    }
  } catch (err) {
    return { error: `tool failed: ${(err as Error).message}` };
  }
}
