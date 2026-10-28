// Crew Dispatch maths, in plain code (CLAUDE.md 6.4: vehicle-hours are computed, never guessed by AI).
// A plan = which crew goes to which event, in order. `evaluate()` simulates it: crews travel from the
// district base (or their last job), a crew on site clears faster, and every event's lost vehicle-hours
// (next 24 h) are summed. `greedyPlan()` is the no-AI plan; the agent may propose a better order and
// gets its numbers from `evaluate()` too.
import { clock } from "../geo/format.ts";
import { eventTitle } from "../events/types.ts";
import { kmBetween, type District } from "./districts.ts";
import { vehicleHoursIf } from "./impact.ts";
import type { CrewInfo, DispatchAction, DispatchStep, QueueItem } from "./types.ts";

const CREW_SPEED_KMH = 25; // a JCB on a low-loader on hill roads
/** Events a road crew can actually fix (traffic jams/accidents are police work, notices are paperwork). */
const CREW_TYPES = new Set(["landslide", "road_damage", "flood_water", "pothole", "snow", "ice", "other"]);

export function needsCrew(q: QueueItem): boolean {
  return CREW_TYPES.has(q.event.type) && q.status !== "open";
}

function canFix(crew: CrewInfo, q: QueueItem): boolean {
  const snowOnly = crew.machines.length > 0 && crew.machines.every((m) => /snow/i.test(m));
  return snowOnly ? q.event.type === "snow" || q.event.type === "ice" : true;
}

/** How much faster an event clears with this crew on it (more machines → faster). */
function crewFactor(crew: CrewInfo): number {
  return crew.machines.length >= 2 ? 0.45 : 0.6;
}

const mid = (q: QueueItem) => (q.hoursLeft.min + q.hoursLeft.max) / 2;
const vh = (q: QueueItem, hours: number) =>
  vehicleHoursIf({ type: q.event.type, status: q.status, highway: q.highway, confidence: q.event.confidence, etaClear: q.event.etaClear ?? null }, hours);

export interface Assignment {
  crewId: string;
  eventId: string;
  action?: DispatchAction;
}

export interface Evaluation {
  baselineVh: number;
  planVh: number;
  savedVh: number;
  /** Per assignment, in the given order; invalid ones carry an error instead. */
  steps: { crewId: string; eventId: string; startInH: number; clearInH: number; vhWithout: number; vhWith: number; error?: string }[];
}

/**
 * Simulate a plan. Each crew works through its assignments in order; a busy crew first finishes its
 * current job (which already has the crew's effect in its estimate). Events nobody is sent to clear
 * at their own pace (baseline).
 */
export function evaluate(queue: QueueItem[], crews: CrewInfo[], base: District, plan: Assignment[]): Evaluation {
  const byId = new Map(queue.map((q) => [q.event.id, q]));
  const clearAt = new Map(queue.map((q) => [q.event.id, mid(q)])); // hours from now, baseline
  const crewState = new Map(
    crews.map((c) => {
      const cur = c.currentEventId ? byId.get(c.currentEventId) : undefined;
      return [c.id, { free: cur ? mid(cur) : 0, at: cur ? { lat: cur.event.lat, lng: cur.event.lng } : { lat: base.lat, lng: base.lng } }];
    }),
  );
  const steps: Evaluation["steps"] = [];
  const taken = new Set<string>();

  for (const a of plan) {
    const q = byId.get(a.eventId);
    const crew = crews.find((c) => c.id === a.crewId);
    const st = crewState.get(a.crewId);
    const fail = (error: string) => steps.push({ crewId: a.crewId, eventId: a.eventId, startInH: 0, clearInH: 0, vhWithout: 0, vhWith: 0, error });
    if (!q || !crew || !st) {
      fail("unknown crewId or eventId");
      continue;
    }
    const without = mid(q);
    if (crew.currentEventId === q.event.id) {
      // "keep": already on site — its estimate already includes the crew.
      steps.push({ crewId: crew.id, eventId: q.event.id, startInH: 0, clearInH: without, vhWithout: vh(q, without), vhWith: vh(q, without) });
      taken.add(q.event.id);
      continue;
    }
    if (!needsCrew(q)) {
      fail("this event is not crew work (traffic/accident/notice or already open)");
      continue;
    }
    if (!canFix(crew, q)) {
      fail(`${crew.name} has the wrong machines for this event`);
      continue;
    }
    if (taken.has(q.event.id)) {
      fail("another crew is already assigned to this event in the plan");
      continue;
    }
    const travel = kmBetween(st.at, q.event) / CREW_SPEED_KMH;
    const start = st.free + travel;
    // Work left when the crew arrives, done faster with the crew; never later than without it.
    const clear = Math.min(without, start + Math.max(0, without - start) * crewFactor(crew));
    clearAt.set(q.event.id, clear);
    st.free = clear;
    st.at = { lat: q.event.lat, lng: q.event.lng };
    taken.add(q.event.id);
    steps.push({ crewId: crew.id, eventId: q.event.id, startInH: start, clearInH: clear, vhWithout: vh(q, without), vhWith: vh(q, clear) });
  }

  const baselineVh = queue.reduce((s, q) => s + vh(q, mid(q)), 0);
  const planVh = queue.reduce((s, q) => s + vh(q, clearAt.get(q.event.id)!), 0);
  return { baselineVh, planVh, savedVh: Math.max(0, baselineVh - planVh), steps };
}

/** No-AI plan: keep busy crews; send each free crew to the unassigned event where it saves the most. */
export function greedyPlan(queue: QueueItem[], crews: CrewInfo[], base: District): Assignment[] {
  const plan: Assignment[] = crews
    .filter((c) => c.currentEventId && queue.some((q) => q.event.id === c.currentEventId))
    .map((c) => ({ crewId: c.id, eventId: c.currentEventId!, action: "keep" as const }));
  const open = queue.filter((q) => needsCrew(q) && !q.crew);
  const perCrew = new Map<string, number>();

  for (let round = 0; round < open.length; round++) {
    const current = evaluate(queue, crews, base, plan).planVh;
    let best: { a: Assignment; gain: number } | null = null;
    for (const q of open) {
      if (plan.some((p) => p.eventId === q.event.id)) continue;
      for (const c of crews) {
        if ((perCrew.get(c.id) ?? 0) >= 2 || !canFix(c, q)) continue;
        const busy = Boolean(c.currentEventId) || (perCrew.get(c.id) ?? 0) > 0;
        const a: Assignment = { crewId: c.id, eventId: q.event.id, action: busy ? "send_later" : "send" };
        const gain = current - evaluate(queue, crews, base, [...plan, a]).planVh;
        if (gain > 0 && (!best || gain > best.gain)) best = { a, gain };
      }
    }
    if (!best) break;
    plan.push(best.a);
    perCrew.set(best.a.crewId, (perCrew.get(best.a.crewId) ?? 0) + 1);
  }
  return plan;
}

/** Clock time `hours` from now, rounded to 15 min (estimates shouldn't look precise). */
export const at = (hours: number) => {
  const q = 15 * 60_000;
  return clock(new Date(Math.round((Date.now() + hours * 3_600_000) / q) * q).toISOString());
};

/** Turn assignments into display steps (code wording; the agent may supply its own `when`/`text`). */
export function describe(
  queue: QueueItem[],
  crews: CrewInfo[],
  ev: Evaluation,
  plan: (Assignment & { when?: string; text?: string })[],
): DispatchStep[] {
  const out: DispatchStep[] = [];
  plan.forEach((a, i) => {
    const s = ev.steps[i];
    const q = queue.find((x) => x.event.id === a.eventId);
    const c = crews.find((x) => x.id === a.crewId);
    if (!s || s.error || !q || !c) return;
    const title = eventTitle(q.event.type, q.event.placeName);
    const place = q.event.placeName ?? title;
    const action: DispatchAction = c.currentEventId === q.event.id ? "keep" : a.action === "keep" ? "send" : (a.action ?? "send");
    const fullyClosed = q.status === "closed" ? " It's fully closed." : "";
    const when = a.when ?? (action === "keep" ? `until clear (~${at(s.clearInH)})` : s.startInH < 1 ? "now" : `~${at(s.startInH)}`);
    const text =
      a.text ??
      (action === "keep"
        ? `Keep ${c.name} at ${place} until it's fully open (~${at(s.clearInH)}).`
        : action === "send" && s.startInH < 1
          ? `Send ${c.name} to ${place} now.${fullyClosed}`
          : `${c.name} to ${place} next (~${at(s.startInH)}).${fullyClosed}`);
    out.push({ crewId: c.id, crewName: c.name, eventId: q.event.id, eventTitle: title, action, when, text, clearInH: s.clearInH });
  });
  return out;
}
