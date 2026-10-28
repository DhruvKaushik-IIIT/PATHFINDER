// Server-only: tools for the Route Check agent (CLAUDE.md 6.4). Every tool is plain code over the
// route plan (OSRM + events, already computed), the database or Open-Meteo — the model only reasons.
import type OpenAI from "openai";
import { z } from "zod";
import { select } from "../../db/supabase.ts";
import type { RoutePlan } from "../../geo/routeTypes.ts";
import { weatherAt } from "../../weather.ts";
import { RouteVerdict } from "../schemas.ts";

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

// ---------------------------------------------------------------- time helpers (IST)

const IST_OFFSET_MS = 5.5 * 3_600_000;
/** "2026-10-28T22:54:00+05:30" — models read local times more reliably than UTC. */
export function ist(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${d.toISOString().slice(0, 19)}+05:30`;
}
const CLOCK = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" });
const clock = (iso: string | Date) => CLOCK.format(new Date(iso));
const agoMin = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60_000);

// ---------------------------------------------------------------- event details (one query per check)

interface EventDetail {
  id: string;
  type: string;
  status: string;
  place_name: string | null;
  summary: string | null;
  passable: unknown;
  measurements: unknown;
  eta_clear: { earliest: string; latest: string } | null;
  confidence: number;
  started_at: string;
  last_confirmed_at: string;
  sources: unknown;
  models_agreed: number | null;
  event_timeline: { at: string; kind: string; text: string; actor: string | null }[];
}

async function loadDetails(ids: string[]): Promise<Map<string, EventDetail>> {
  if (!ids.length) return new Map();
  const rows = await select<EventDetail>(
    "events",
    "select=id,type,status,place_name,summary,passable,measurements,eta_clear,confidence,started_at,last_confirmed_at,sources,models_agreed," +
      `event_timeline(at,kind,text,actor)&id=in.(${ids.join(",")})&event_timeline.order=at.desc&event_timeline.limit=5`,
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// ---------------------------------------------------------------- static pass/tunnel guidance

// General, well-known operating patterns — always labelled "verify locally" (not live data).
const PASSES: Record<string, string> = {
  "atal tunnel":
    "Open 24 h all year; in winter after fresh snow the police regulate or stop tourist vehicles at Solang/Palchan and the north portal, 4x4 or chains advised; early mornings are icy.",
  rohtang:
    "Seasonal: usually closed to traffic from about mid-November to May; in season needs an online permit and is closed on Tuesdays for maintenance. Use Atal Tunnel instead for Lahaul.",
  jalori: "Closes after heavy snow (roughly December–March); narrow single-lane stretches near the top; avoid after dark.",
  "kunzum": "Open roughly June–October only.",
  "baralacha": "Open roughly June–October; snow possible any month.",
};

function passTimings(place: string): string {
  const k = Object.keys(PASSES).find((p) => place.toLowerCase().includes(p));
  return k ? `${PASSES[k]} (general guidance, not live — verify locally)` : "No timing rules known for this place.";
}

// ---------------------------------------------------------------- estimate_eta (code, not AI)

function estimate(plan: RoutePlan, details: Map<string, EventDetail>, routeId: string, departIso: string) {
  const r = plan.routes.find((x) => x.id === routeId);
  if (!r) return { error: `unknown routeId ${routeId}; use list_routes` };
  const depart = new Date(departIso);
  if (Number.isNaN(depart.getTime())) return { error: "departAt must be an ISO date-time, e.g. 2026-10-29T04:00:00+05:30" };
  const planDepart = new Date(plan.departAt).getTime();

  let delaysBefore = 0; // in the original plan
  let added = 0; // in this estimate
  let blocked = false;
  const events = r.events.map((e) => {
    const driveOffsetMs = new Date(e.etaAt).getTime() - planDepart - delaysBefore * 60_000;
    delaysBefore += e.delayMin;
    const reach = new Date(depart.getTime() + driveOffsetMs + added * 60_000);
    const clear = details.get(e.id)?.eta_clear;
    let delay = e.delayMin;
    let note = e.blocks ? "closed" : e.delayMin ? `~${e.delayMin} min delay` : "no delay";
    let blocks = e.blocks;
    if (clear && (e.delayMin || e.blocks)) {
      const earliest = new Date(clear.earliest).getTime();
      const latest = new Date(clear.latest).getTime();
      if (reach.getTime() >= latest) {
        delay = e.blocks ? 10 : 0; // just reopened: expect a short queue
        blocks = false;
        note = "expected to be cleared by then";
      } else if (reach.getTime() >= earliest) {
        delay = e.blocks ? 30 : Math.round(e.delayMin / 2);
        blocks = false;
        note = "may be clearing by then (estimate)";
      }
    }
    added += delay;
    if (blocks) blocked = true;
    return { eventId: e.id, place: e.placeName, reachAt: ist(reach), reachClock: clock(reach), delayMin: delay, blocks, note };
  });
  const arrive = new Date(depart.getTime() + (r.driveMin + added) * 60_000);
  return {
    routeId,
    departAt: ist(depart),
    departClock: clock(depart),
    arriveAt: ist(arrive),
    arriveClock: clock(arrive),
    totalMin: r.driveMin + added,
    blocked,
    events,
  };
}

// ---------------------------------------------------------------- tool definitions

const fn = (name: string, description: string, parameters: Record<string, unknown>): Tool => ({
  type: "function",
  function: { name, description, parameters },
});
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: "object", properties: props, required, additionalProperties: false });

const submitSchema = (() => {
  const s = { ...(z.toJSONSchema(RouteVerdict) as Record<string, unknown>) };
  delete s.$schema;
  return s;
})();

export const ROUTE_CHECK_TOOLS: Tool[] = [
  fn("list_routes", "List the route options for this trip with distance, drive time, delays, arrival, roads/towns and the code-computed verdict. Call first.", obj({}, [])),
  fn(
    "get_events_on_route",
    "Verified road events on one route in driving order: type, status, when you reach it, delay, confidence, freshness.",
    obj({ routeId: { type: "string", description: "e.g. r0" } }, ["routeId"]),
  ),
  fn(
    "get_event_detail",
    "Full detail of one event: measurements, passability, estimated clearing window (eta_clear), sources and the latest timeline (reports, official updates, news).",
    obj({ eventId: { type: "string" } }, ["eventId"]),
  ),
  fn(
    "get_weather",
    "Open-Meteo forecast at a point for a given time: temperature, rain/snow now and over the next 6 hours, rain chance, elevation.",
    obj(
      {
        lat: { type: "number" },
        lng: { type: "number" },
        at: { type: "string", description: "ISO date-time (IST), e.g. when the traveller reaches that spot" },
      },
      ["lat", "lng", "at"],
    ),
  ),
  fn(
    "estimate_eta",
    "Recompute the trip for a different departure time on one route: when each event is reached, whether it will likely be cleared by then (from its clearing window), total time and arrival. Use this for every time you state.",
    obj({ routeId: { type: "string" }, departAt: { type: "string", description: "ISO date-time with +05:30" } }, ["routeId", "departAt"]),
  ),
  fn(
    "get_pass_timings",
    "General operating rules for a pass or tunnel (Atal Tunnel, Rohtang, Jalori, Kunzum, Baralacha). Not live data.",
    obj({ place: { type: "string" } }, ["place"]),
  ),
  fn("submit_verdict", "Submit the final route verdict. Call exactly once, at the end.", submitSchema),
];

// ---------------------------------------------------------------- executor

export interface RouteCheckContext {
  plan: RoutePlan;
  details: Map<string, EventDetail>;
}

export async function routeCheckContext(plan: RoutePlan): Promise<RouteCheckContext> {
  const ids = [...new Set(plan.routes.flatMap((r) => r.events.map((e) => e.id)))];
  return { plan, details: await loadDetails(ids).catch(() => new Map()) };
}

/** Runs one tool call. Never throws: errors come back as text the model can recover from. */
export async function runRouteCheckTool(ctx: RouteCheckContext, name: string, rawArgs: string): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { error: "arguments were not valid JSON" };
  }
  const { plan, details } = ctx;
  switch (name) {
    case "list_routes":
      return plan.routes.map((r) => ({
        routeId: r.id,
        recommendedByCode: r.recommended,
        distanceKm: r.distanceKm,
        driveMin: r.driveMin,
        delayMin: r.delayMin,
        departAt: ist(plan.departAt),
        arriveAt: ist(r.arriveAt),
        arriveClock: clock(r.arriveAt),
        viaRoads: r.viaRoads,
        viaTowns: r.viaTowns,
        blocked: r.blocked,
        codeVerdict: r.verdict,
        himachal: r.hp,
        legs: r.legs.map((l) => `${l.insideHp ? "inside HP" : "outside HP"}: ${l.fromName ?? "?"} → ${l.toName ?? "?"}, ${l.distanceKm.toFixed(0)} km, ${Math.round(l.durationMin)} min`),
        eventCount: r.events.length,
      }));
    case "get_events_on_route": {
      const r = plan.routes.find((x) => x.id === args.routeId);
      if (!r) return { error: `unknown routeId ${String(args.routeId)}` };
      return r.events.map((e) => ({
        eventId: e.id,
        order: e.order,
        place: e.placeName,
        road: e.roadRef,
        type: e.type,
        status: e.status,
        lat: e.lat,
        lng: e.lng,
        reachAt: ist(e.etaAt),
        reachClock: clock(e.etaAt),
        delayMin: e.delayMin,
        blocks: e.blocks,
        confidence: e.confidence,
        lastConfirmedMinAgo: agoMin(e.lastConfirmedAt),
        reports: e.reports,
        newsItems: e.news,
        summary: e.summary,
      }));
    }
    case "get_event_detail": {
      const d = details.get(String(args.eventId));
      if (!d) return { error: "unknown eventId (use ids from get_events_on_route)" };
      return {
        ...d,
        eta_clear: d.eta_clear ? { earliest: ist(d.eta_clear.earliest), latest: ist(d.eta_clear.latest) } : null,
        lastConfirmedMinAgo: agoMin(d.last_confirmed_at),
        startedHoursAgo: Math.round(agoMin(d.started_at) / 60),
        event_timeline: d.event_timeline.map((t) => ({ ...t, at: ist(t.at) })),
      };
    }
    case "get_weather": {
      const lat = Number(args.lat);
      const lng = Number(args.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "lat and lng must be numbers" };
      try {
        return await weatherAt(lat, lng, String(args.at ?? new Date().toISOString()));
      } catch {
        return { error: "weather unavailable right now — don't rely on weather" };
      }
    }
    case "estimate_eta":
      return estimate(plan, details, String(args.routeId), String(args.departAt));
    case "get_pass_timings":
      return { place: args.place, guidance: passTimings(String(args.place ?? "")) };
    default:
      return { error: `unknown tool ${name}` };
  }
}
