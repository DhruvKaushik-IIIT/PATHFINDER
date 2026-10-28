// GET /api/cron/road-watch — safety-net sweep over all watched trips (auth: lib/cron.ts). The main
// path is event-driven (after a report / news item changes an event); this catches anything missed.
// Plain code compares disruptions; the agent runs only for trips whose route actually changed.
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron.ts";
import { hasDb } from "@/lib/db/supabase.ts";
import { runRoadWatch } from "@/lib/watch/roadWatch.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const results = await runRoadWatch();
  return NextResponse.json({ ok: true, data: results });
}
