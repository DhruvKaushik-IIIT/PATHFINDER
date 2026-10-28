// Server-only: the AI Dispatch Plan card. Code plan first (instant, free); with ai=true the Crew Dispatch
// agent (Wonder → Baseten) may reorder it and explains it. Whatever the agent submits is re-scored by
// code, invalid steps are dropped, and if it saves less than the code plan the code plan wins.
// Cached 30 min per district + event/crew state (5.4 budget rules: reloading the page costs nothing).
import { crewDispatch } from "../ai/router.ts";
import type { District } from "./districts.ts";
import { describe, evaluate, greedyPlan, type Assignment } from "./dispatch.ts";
import { crewsOf, rankedQueue } from "./queue.ts";
import type { CrewInfo, DispatchPlan, QueueItem } from "./types.ts";

const TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; plan: DispatchPlan }>();

function stateKey(d: District, queue: QueueItem[], crews: CrewInfo[]): string {
  const ev = queue.map((q) => `${q.event.id}:${q.status}:${q.event.lastConfirmedAt}`).sort();
  const cr = crews.map((c) => `${c.id}:${c.available}:${c.currentEventId ?? "-"}`).sort();
  return `${d.name}#${ev.join("|")}#${cr.join("|")}`;
}

function codePlan(queue: QueueItem[], crews: CrewInfo[], d: District): DispatchPlan {
  const plan = greedyPlan(queue, crews, d);
  const ev = evaluate(queue, crews, d, plan);
  const steps = describe(queue, crews, ev, plan);
  const first = steps.find((s) => s.action !== "keep");
  return {
    steps,
    baselineVh: ev.baselineVh,
    planVh: ev.planVh,
    savedVh: ev.savedVh,
    headline: first ? `${first.crewName} to ${first.eventTitle.replace(/^.* (at|near) /, "")} first` : "Keep crews where they are",
    headlineHi: null,
    reasoning: first
      ? "Free crews go where they cut the most lost vehicle-hours (traffic × hours until clear × delay per vehicle); busy crews finish their job first."
      : "No free crew can shorten an open disruption right now.",
    by: "code",
    trace: [],
    cached: false,
  };
}

export async function dispatchPlan(d: District, org: string, opts: { ai: boolean }): Promise<{ plan: DispatchPlan; degraded?: string }> {
  const crews = await crewsOf(d);
  const queue = await rankedQueue(d, crews);
  const code = codePlan(queue, crews, d);
  if (!opts.ai || !code.steps.some((s) => s.action !== "keep")) return { plan: code };

  const key = stateKey(d, queue, crews);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { plan: { ...hit.plan, cached: true } };

  const base = greedyPlan(queue, crews, d);
  const res = await crewDispatch({ district: d, queue, crews, codePlan: base }, org);
  const p = res.data.proposal;
  if (!p) return { plan: code, degraded: res.degraded ? "AI dispatch unavailable — showing the basic plan" : undefined };

  const assignments: (Assignment & { when: string; text: string })[] = p.steps.map((s) => ({ ...s }));
  const ev = evaluate(queue, crews, d, assignments);
  const valid = assignments.filter((_, i) => !ev.steps[i]!.error);
  const final = evaluate(queue, crews, d, valid);
  // Never show a plan that saves less than the one code already found.
  if (!valid.length || final.savedVh < code.savedVh * 0.95) {
    return { plan: { ...code, reasoning: `${code.reasoning} (The AI's alternative saved less, so the code plan is shown.)` } };
  }
  const plan: DispatchPlan = {
    steps: describe(queue, crews, final, valid),
    baselineVh: final.baselineVh,
    planVh: final.planVh,
    savedVh: final.savedVh,
    headline: p.headline,
    headlineHi: p.headlineHi,
    reasoning: p.reasoning,
    by: res.data.by,
    model: res.model,
    trace: res.data.trace,
    cached: false,
  };
  if (plan.by === "meta" || plan.by === "baseten") {
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), plan });
  }
  return { plan, degraded: res.degraded && plan.by === "baseten" ? "Muse Wonder unavailable — plan by Muse Spark Open" : undefined };
}

