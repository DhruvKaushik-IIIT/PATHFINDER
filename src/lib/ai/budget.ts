// Server-only: the global daily AI spend cap (Phase 6D, CLAUDE.md 5.4). Every router job checks it first;
// over the cap the job skips the providers and returns its existing no-AI last resort (code verdicts,
// templates, "measurement unavailable") — the app degrades, it never crashes.
// Spend today = ai_calls.cost_usd since IST midnight (re-read every 60 s) + calls this instance logged since.
import { hasDb, select } from "../db/supabase.ts";

const REFRESH_MS = 60_000;
const DEFAULT_CAP_USD = 10;

let cached = { at: 0, day: "", usd: 0 };
let localSince = 0; // spend logged by this instance after the last DB read

export function dailyCapUsd(): number {
  const v = Number(process.env.AI_DAILY_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_CAP_USD;
}

/** IST calendar day "YYYY-MM-DD" and its start as an ISO instant. */
function istDay(now = Date.now()): { day: string; startIso: string } {
  const day = new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
  return { day, startIso: new Date(Date.parse(`${day}T00:00:00Z`) - 5.5 * 3_600_000).toISOString() };
}

/** Called by the router after each logged call. */
export function noteSpend(usd: number | null): void {
  if (usd && usd > 0) localSince += usd;
}

export async function spentTodayUsd(): Promise<number> {
  const { day, startIso } = istDay();
  if (!hasDb()) return localSince;
  if (cached.day === day && Date.now() - cached.at < REFRESH_MS) return cached.usd + localSince;
  try {
    const rows = await select<{ cost_usd: number | null }>("ai_calls", `select=cost_usd&at=gte.${startIso}&cost_usd=gt.0&limit=50000`);
    cached = { at: Date.now(), day, usd: rows.reduce((t, r) => t + (r.cost_usd ?? 0), 0) };
    localSince = 0;
  } catch {
    // DB unreachable: keep the last known figure (the in-memory part still grows).
    cached.at = Date.now();
  }
  return cached.usd + localSince;
}

/** null = under the cap; else a message safe to show in a toast. */
export async function overBudget(): Promise<string | null> {
  const spent = await spentTodayUsd();
  if (spent < dailyCapUsd()) return null;
  return "Today's AI budget is used up — showing the basic check (no AI) until midnight IST";
}

/** For the dev footer / health. */
export async function budgetStatus(): Promise<{ spentUsd: number; capUsd: number; over: boolean }> {
  const spentUsd = Math.round((await spentTodayUsd()) * 1000) / 1000;
  return { spentUsd, capUsd: dailyCapUsd(), over: spentUsd >= dailyCapUsd() };
}
