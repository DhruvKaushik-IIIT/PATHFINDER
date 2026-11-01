// GET /api/top[?limit=10] → the most important open incidents/closures across Himachal. Plain code, no AI.
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { topAcrossHimachal } from "@/lib/events/top.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const n = Number(new URL(req.url).searchParams.get("limit") ?? 10);
  const limit = Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 10;
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    const data = await topAcrossHimachal(limit);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "top_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: true, data: null, degraded: "Himachal overview is unavailable right now" });
  }
}
