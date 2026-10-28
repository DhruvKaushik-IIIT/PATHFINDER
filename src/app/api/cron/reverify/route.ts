// GET /api/cron/reverify — Investigator sweep (auth: lib/cron.ts): the most doubtful open events
// (low confidence, stale, past their clearing time, news-only), a few per run.
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron.ts";
import { hasDb } from "@/lib/db/supabase.ts";
import { sweepInvestigations } from "@/lib/investigate/investigator.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const limit = Math.min(10, Number(new URL(req.url).searchParams.get("limit") ?? 6) || 6);
  const results = await sweepInvestigations(limit);
  return NextResponse.json({
    ok: true,
    data: results.map((r) => ({ eventId: r.eventId, ran: r.ran, skipped: r.skipped, reason: r.reason, finding: r.note?.finding, by: r.note?.by })),
  });
}
