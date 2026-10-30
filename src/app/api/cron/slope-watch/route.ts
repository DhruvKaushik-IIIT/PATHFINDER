// GET /api/cron/slope-watch[?replay=1] — daily Slope Sentinel sweep (auth: lib/cron.ts): decay, forecast check,
// the risk agent only when the forecast turned wet, scout requests for slopes nobody photographed in 24 h.
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron.ts";
import { hasDb } from "@/lib/db/supabase.ts";
import { sweepSlopes } from "@/lib/slope/cron.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const replay = new URL(req.url).searchParams.get("replay") === "1";
  return NextResponse.json({ ok: true, data: await sweepSlopes({ replay }) });
}
