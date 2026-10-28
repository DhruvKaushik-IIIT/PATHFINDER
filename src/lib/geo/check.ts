// Server-only: Route Check = code plan (no AI) + the agent's verdict on top, with the budget rules
// from CLAUDE.md 5.4: no events → no AI; one event → Spark; several / a closure → Wonder.
// Cached 20 min per (trip, 30-min departure window, event state).
import { routeCheck, type RouteCheckOutput } from "../ai/router.ts";
import type { RouteVerdict } from "../ai/schemas.ts";
import { routeCheckContext } from "../ai/tools/routeCheck.ts";
import { planRoute, type NamedPoint } from "./route.ts";
import type { RoutePlan } from "./routeTypes.ts";

const TTL_MS = 20 * 60_000;
const cache = new Map<string, { at: number; check: RouteCheckResult }>();

export interface RouteCheckResult {
  verdict: RouteVerdict;
  by: RouteCheckOutput["by"];
  tier: "none" | "spark" | "wonder";
  trace: string[];
  cached: boolean;
}

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => IST.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);

/** The verdict built by code from the plan — used when no AI is needed or none is available. */
export function codeRouteVerdict(plan: RoutePlan): RouteVerdict {
  const best = plan.routes[0]!;
  const v = best.verdict;
  return {
    verdict: v.verdict,
    headline: v.verdict === "avoid" ? v.headline : `${v.pill} · arrive ~${clock(best.arriveAt)}`,
    headlineHi: v.verdict === "avoid" ? "रास्ता बंद है — दूसरा रास्ता लें" : `पहुँचने का अनुमान ~${clock(best.arriveAt)}`,
    disruptions: best.events
      .filter((e) => e.delayMin > 0 || e.blocks)
      .map((e) => ({
        eventId: e.id,
        order: e.order,
        etaAtSegment: e.etaAt,
        impact: e.blocks ? "closed" : `${e.status.replace("_", " ")}, ~${e.delayMin} min`,
      })),
    options: plan.routes.slice(0, 3).map((r) => ({
      label: `Via ${r.viaRoads[0] ?? r.viaTowns[0] ?? "main road"}${r.blocked ? " (closed)" : ""}`,
      departAt: plan.departAt,
      arriveAt: r.arriveAt,
      viaRoad: r.viaRoads[0] ?? null,
      pros: r.recommended ? ["Fastest open route"] : [],
      cons: r.blocked ? ["Closed on the way"] : r.delayMin ? [`~${r.delayMin} min of delays`] : [],
      recommended: r.recommended,
    })),
    reasoning: v.detail,
    usedSources: ["OSRM route", `verified road events (${best.events.length})`],
  };
}

/** Keep the agent honest: drop disruptions it invented, make exactly one option recommended. */
function sanitize(v: RouteVerdict, plan: RoutePlan): RouteVerdict {
  const known = new Set(plan.routes.flatMap((r) => r.events.map((e) => e.id)));
  const options = v.options.filter((o) => !Number.isNaN(new Date(o.departAt).getTime()) && !Number.isNaN(new Date(o.arriveAt).getTime()));
  const rec = Math.max(0, options.findIndex((o) => o.recommended));
  return {
    ...v,
    disruptions: v.disruptions.filter((d) => known.has(d.eventId)).sort((a, b) => a.order - b.order),
    options: options.map((o, i) => ({ ...o, recommended: i === rec })),
  };
}

export async function checkRoute(from: NamedPoint, to: NamedPoint, departAt: Date): Promise<{ plan: RoutePlan; check: RouteCheckResult; degraded?: string }> {
  const { degraded, ...plan } = await planRoute(from, to, departAt);
  const relevant = plan.routes.flatMap((r) => r.events.filter((e) => e.delayMin > 0 || e.blocks));
  const anyBlocked = plan.routes.some((r) => r.blocked);
  const best = plan.routes[0]!;
  const bestIssues = best.events.filter((e) => e.delayMin > 0 || e.blocks).length;

  // No AI for a clear road (7.5b) — and nothing to reason about outside Himachal.
  if (!relevant.length || best.hp.insideKm < 0.5) {
    return { plan, check: { verdict: codeRouteVerdict(plan), by: "code", tier: "none", trace: [], cached: false }, degraded };
  }
  const tier = bestIssues <= 1 && !anyBlocked ? "spark" : "wonder";

  const window30 = Math.floor(departAt.getTime() / 1_800_000);
  const state = [...new Set(relevant.map((e) => `${e.id}:${e.status}:${e.lastConfirmedAt}`))].sort().join("|");
  const key = [from.lat, from.lng, to.lat, to.lng].map((x) => x.toFixed(3)).join(",") + `@${window30}#${state}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { plan, check: { ...hit.check, cached: true }, degraded };

  const ctx = await routeCheckContext(plan);
  const res = await routeCheck(ctx, tier, () => codeRouteVerdict(plan));
  const check: RouteCheckResult = { verdict: sanitize(res.data.verdict, plan), by: res.data.by, tier, trace: res.data.trace, cached: false };
  // Only cache real agent answers; a fallback should be retried next time.
  if (res.data.by === "meta" || res.data.by === "baseten") {
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), check });
  }
  const agentDegraded = res.degraded && res.data.by === "code" ? "AI route check unavailable — showing the basic check" : undefined;
  return { plan, check, degraded: [degraded, agentDegraded].filter(Boolean).join("; ") || undefined };
}
