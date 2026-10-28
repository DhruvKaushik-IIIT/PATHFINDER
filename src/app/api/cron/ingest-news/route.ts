// GET /api/cron/ingest-news[?dry=1] — Vercel Cron (vercel.json) or a manual run (auth: lib/cron.ts).
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron.ts";
import { hasDb } from "@/lib/db/supabase.ts";
import { ingestNews } from "@/lib/news/ingest.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const report = await ingestNews({ dryRun });
  console.info("[news] ingest:", JSON.stringify({ ...report, results: report.results.map((r) => `${r.place}: ${r.outcome.action}`) }));
  return NextResponse.json({ ok: true, data: report, ...(report.degraded && { degraded: report.degraded }) });
}
