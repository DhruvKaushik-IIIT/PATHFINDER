// Server-only: tools for the Crew Dispatch agent (CLAUDE.md 6.4). All plain code over the ranked queue,
// the crews and the dispatch simulator — the model only chooses and explains.
import type OpenAI from "openai";
import { z } from "zod";
import { eventTitle } from "../../events/types.ts";
import type { District } from "../../official/districts.ts";
import { evaluate, needsCrew, type Assignment } from "../../official/dispatch.ts";
import type { CrewInfo, QueueItem } from "../../official/types.ts";
import { weatherAt } from "../../weather.ts";
import { DispatchProposal } from "../schemas.ts";
import { ist } from "./routeCheck.ts";

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

export interface DispatchContext {
  district: District;
  queue: QueueItem[];
  crews: CrewInfo[];
  codePlan: Assignment[];
}

const fn = (name: string, description: string, parameters: Record<string, unknown>): Tool => ({
  type: "function",
  function: { name, description, parameters },
});
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: "object", properties: props, required, additionalProperties: false });
const assignments = {
  type: "array",
  description: "Crew → event steps in order. A crew listed twice does the jobs one after the other.",
  items: obj({ crewId: { type: "string" }, eventId: { type: "string" } }, ["crewId", "eventId"]),
};

const submitSchema = (() => {
  const s = { ...(z.toJSONSchema(DispatchProposal) as Record<string, unknown>) };
  delete s.$schema;
  return s;
})();

export const DISPATCH_TOOLS: Tool[] = [
  fn("get_open_events", "Open events in the district ranked by impact: type, status, road, est. vehicles/day, hours until clear, lost vehicle-hours, crew on site, confidence, location.", obj({}, [])),
  fn("get_crews", "Road crews of the district: machines, free or busy, current job.", obj({}, [])),
  fn("get_code_plan", "The plan computed by code (keep busy crews, send free crews where they save the most) and its vehicle-hour savings.", obj({}, [])),
  fn(
    "compute_vehicle_hours",
    "Lost vehicle-hours (next 24 h) for one event without a new crew vs. with this crew sent now. Code-computed.",
    obj({ eventId: { type: "string" }, crewId: { type: "string" } }, ["eventId", "crewId"]),
  ),
  fn("evaluate_plan", "Score a whole plan (code simulation): lost vehicle-hours without changes vs. with the plan, and when each event clears.", obj({ assignments }, ["assignments"])),
  fn(
    "get_weather",
    "Open-Meteo forecast at a point: rain/snow now and over the next 6 hours. Heavy rain makes slide clearing unsafe.",
    obj({ lat: { type: "number" }, lng: { type: "number" }, at: { type: "string", description: "ISO date-time (IST)" } }, ["lat", "lng", "at"]),
  ),
  fn("submit_plan", "Submit the final dispatch plan. Call exactly once, at the end.", submitSchema),
];

const hoursIst = (h: number) => ist(new Date(Date.now() + h * 3_600_000));

function scored(ctx: DispatchContext, plan: Assignment[]) {
  const ev = evaluate(ctx.queue, ctx.crews, ctx.district, plan);
  return {
    baselineVehicleHours: ev.baselineVh,
    planVehicleHours: ev.planVh,
    savedVehicleHours: ev.savedVh,
    steps: ev.steps.map((s) => ({
      crewId: s.crewId,
      eventId: s.eventId,
      ...(s.error ? { error: s.error } : { startsAt: hoursIst(s.startInH), clearsAt: hoursIst(s.clearInH), vehicleHoursWithout: s.vhWithout, vehicleHoursWith: s.vhWith }),
    })),
  };
}

/** Runs one tool call. Never throws: errors come back as text the model can recover from. */
export async function runDispatchTool(ctx: DispatchContext, name: string, rawArgs: string): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { error: "arguments were not valid JSON" };
  }
  switch (name) {
    case "get_open_events":
      return ctx.queue.map((q) => ({
        eventId: q.event.id,
        rank: q.rank,
        title: eventTitle(q.event.type, q.event.placeName),
        type: q.event.type,
        status: q.status,
        road: q.road,
        lat: q.event.lat,
        lng: q.event.lng,
        vehiclesPerDayEst: q.vehiclesPerDay,
        hoursUntilClear: q.hoursLeft,
        clearingEstimateFromReports: q.etaKnown,
        lostVehicleHoursIfLeft: q.vehicleHours,
        debrisM3: q.debrisM3,
        crewOnSite: q.crew?.name ?? null,
        crewWork: needsCrew(q),
        confidence: q.event.confidence,
        summary: q.event.summary,
      }));
    case "get_crews":
      return ctx.crews.map((c) => ({
        crewId: c.id,
        name: c.name,
        org: c.org,
        machines: c.machines,
        free: c.available && !c.currentEventId,
        currentEventId: c.currentEventId,
      }));
    case "get_code_plan":
      return { plan: ctx.codePlan, ...scored(ctx, ctx.codePlan) };
    case "compute_vehicle_hours": {
      const r = scored(ctx, [{ crewId: String(args.crewId), eventId: String(args.eventId) }]).steps[0];
      return r ?? { error: "nothing to compute" };
    }
    case "evaluate_plan": {
      const list = z.array(z.object({ crewId: z.string(), eventId: z.string() })).safeParse(args.assignments);
      if (!list.success) return { error: "assignments must be [{crewId, eventId}, …]" };
      return scored(ctx, list.data);
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
    default:
      return { error: `unknown tool ${name}` };
  }
}
