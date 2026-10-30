// GET /api/repairs?ids=a,b,c → crews at work + latest official progress for those events (public, no AI).
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { repairsFor } from "@/lib/repairs/query.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const ids = z.array(z.string().uuid()).max(40).safeParse([...new Set(raw)]);
  if (!ids.success) return NextResponse.json({ ok: false, error: "ids must be up to 40 event ids" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: [], degraded: "database not configured" });
  try {
    return NextResponse.json({ ok: true, data: await repairsFor(ids.data) }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } });
  } catch (err) {
    console.error("[repairs] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: [], degraded: "Repair updates unavailable right now" });
  }
}
