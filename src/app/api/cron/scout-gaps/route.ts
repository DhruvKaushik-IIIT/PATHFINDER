// GET /api/cron/scout-gaps — data-gap scan (demand × gap → scout requests), then send every open request
// to nearby stationary scouts (auth: lib/cron.ts). Plain code, no AI.
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron.ts";
import { hasDb } from "@/lib/db/supabase.ts";
import { dispatchRequest, openRequests, scanGaps } from "@/lib/scout/requests.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const gaps = await scanGaps();
  const sent = [];
  for (const r of await openRequests()) sent.push(await dispatchRequest(r));
  return NextResponse.json({ ok: true, data: { gaps, sent } });
}
