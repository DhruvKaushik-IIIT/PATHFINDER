// Server-only: per-IP + per-device rate limits for every endpoint that spends AI credits (Phase 6D).
// Fixed windows in memory. On Vercel (Fluid compute) warm instances are shared by many requests, so this
// catches bursts and scripted abuse; it is best-effort across instances — the hard stop is the global
// daily spend cap in lib/ai/budget.ts, which every AI call checks.
import { NextResponse } from "next/server.js"; // .js so plain-node tests can import this file

export type Bucket = "report" | "route" | "nearby" | "investigate" | "fit" | "image" | "slope" | "official" | "login";

/** [max per minute, max per hour] — per IP and, separately, per device (pf_uid cookie). */
export const LIMITS: Record<Bucket, [number, number]> = {
  report: [3, 20], // photo + SAM + 2 models (+ voice) ≈ $0.02–0.04 each
  route: [6, 40], // Route Check agent (Spark / Wonder), cached 20 min per trip
  nearby: [10, 80], // short summary, cached 10 min per area
  investigate: [2, 10],
  fit: [3, 20],
  image: [3, 15], // Muse Image alert card
  slope: [2, 12],
  official: [6, 60], // officials: dispatch agent, advisory, field-update photo checks
  login: [8, 40], // official sign-in (password guessing), not AI
};
const WORD: Record<Bucket, string> = {
  report: "reports", route: "route checks", nearby: "area summaries", investigate: "AI checks", fit: "vehicle checks",
  image: "alert cards", slope: "slope checks", official: "AI actions", login: "sign-in attempts",
};

const hits = new Map<string, { minute: number; m: number; hour: number; h: number }>();

/** Caller IP from Vercel's proxy headers (first hop). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0]!.trim() : req.headers.get("x-real-ip")) || "unknown";
}

function deviceId(req: Request): string | null {
  const m = /(?:^|;\s*)pf_uid=([0-9a-f-]{36})/.exec(req.headers.get("cookie") ?? "");
  return m?.[1] ?? null;
}

/** Counts one request; returns seconds to wait when over the limit, else 0. */
function take(key: string, [perMin, perHour]: [number, number], now: number): number {
  const minute = Math.floor(now / 60_000);
  const hour = Math.floor(now / 3_600_000);
  const e = hits.get(key) ?? { minute, m: 0, hour, h: 0 };
  if (e.minute !== minute) [e.minute, e.m] = [minute, 0];
  if (e.hour !== hour) [e.hour, e.h] = [hour, 0];
  if (e.m >= perMin) return 60 - Math.floor((now % 60_000) / 1000);
  if (e.h >= perHour) return 3600 - Math.floor((now % 3_600_000) / 1000);
  e.m++;
  e.h++;
  hits.set(key, e);
  if (hits.size > 20_000) hits.delete(hits.keys().next().value!);
  return 0;
}

export interface Limited {
  retryAfterS: number;
  message: string;
}

/** null = go ahead. Checks the IP and the device; both count. */
export function checkLimit(req: Request, bucket: Bucket, now = Date.now()): Limited | null {
  const lim = LIMITS[bucket];
  const keys = [`${bucket}:ip:${clientIp(req)}`, ...(deviceId(req) ? [`${bucket}:dev:${deviceId(req)}`] : [])];
  const wait = Math.max(...keys.map((k) => take(k, lim, now)));
  if (!wait) return null;
  const mins = Math.ceil(wait / 60);
  const message = `You've reached the limit for ${WORD[bucket]} for now — please try again in ${mins <= 1 ? "a minute" : `${mins} minutes`}. This keeps Pathfinder free for everyone.`;
  console.warn(JSON.stringify({ level: "warn", event: "rate_limited", bucket, retryAfterS: wait }));
  return { retryAfterS: wait, message };
}

/** Standard 429 for endpoints whose UI shows `error` / `degraded` as a toast. */
export function limitedResponse(l: Limited): NextResponse {
  return NextResponse.json(
    { ok: false, error: l.message, degraded: l.message, limited: true, data: null },
    { status: 429, headers: { "Retry-After": String(l.retryAfterS) } },
  );
}

/** For tests. */
export function _resetLimits(): void {
  hits.clear();
}
