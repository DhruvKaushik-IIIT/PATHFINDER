// GET /api/stats/verification[?days=30] → dual-model agreement stats (plain code over stored records).
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { verificationStats } from "@/lib/verification/stats.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30));
  try {
    return NextResponse.json({ ok: true, data: await verificationStats(days) });
  } catch (err) {
    console.error("[stats] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "stats unavailable right now" });
  }
}
