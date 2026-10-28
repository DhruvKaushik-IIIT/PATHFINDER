// Client-safe helpers shared by /route, /route/options and /event: query parsing, labels, and a
// sessionStorage hand-off so the What-If screen can show the agent's options without re-running it.
import type { RouteVerdict } from "@/lib/ai/schemas";
import type { RoutePlan } from "@/lib/geo/routeTypes";
import { TYPE_WORD } from "@/lib/events/types";

export interface CheckResult {
  verdict: RouteVerdict;
  by: "meta" | "baseten" | "mock" | "code";
  tier: "none" | "spark" | "wonder";
  trace: string[];
  cached: boolean;
}

export const CHECK_KEY = "pf:lastRouteCheck";

export function saveCheck(query: string, plan: RoutePlan, check: CheckResult) {
  try {
    sessionStorage.setItem(CHECK_KEY, JSON.stringify({ query, plan, check }));
  } catch {
    // storage full / disabled: What-If falls back to re-fetching
  }
}

export function loadCheck(): { query: string; plan: RoutePlan; check: CheckResult } | null {
  try {
    const raw = sessionStorage.getItem(CHECK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const AT = new Set(["snow", "ice", "flood_water", "traffic", "closure_notice"]);
/** "Landslide near Aut", "Snow at Atal Tunnel" */
export function eventTitle(type: string, place: string | null): string {
  const what = TYPE_WORD[type] ?? "Road issue";
  return place ? `${what} ${AT.has(type) ? "at" : "near"} ${place}` : what;
}

export const VERDICT_WORD: Record<RouteVerdict["verdict"], string> = {
  go: "GO",
  go_with_care: "GO WITH CARE",
  delay: "DELAY",
  avoid: "AVOID",
};

/** "Now" · "Today 6:30 PM" · "Tomorrow 5 AM" (IST) */
export function departLabel(iso: string | null): string {
  if (!iso) return "Leave now";
  const d = new Date(iso);
  if (Math.abs(d.getTime() - Date.now()) < 10 * 60_000) return "Leave now";
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(x);
  const today = day(new Date());
  const tomorrow = day(new Date(Date.now() + 86_400_000));
  const t = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
    .format(d)
    .replace(":00", "")
    .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
  const dd = day(d);
  return `${dd === today ? "Today" : dd === tomorrow ? "Tomorrow" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).format(d)} ${t}`;
}

/** Which model checked the route, in words (for the "why" box). */
export function checkedBy(c: CheckResult): string {
  if (c.by === "code") return "Basic check (no AI needed)";
  if (c.by === "mock") return "Demo data (AI off)";
  const model = c.by === "meta" ? (c.tier === "wonder" ? "Muse Wonder" : "Muse Spark") : "Muse Spark Open";
  const checks = c.trace.filter((t) => t !== "submit_verdict").length;
  return `${model} agent · ${checks} checks${c.cached ? " · cached" : ""}`;
}
