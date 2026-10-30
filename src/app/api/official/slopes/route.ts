// GET /api/official/slopes → "Slopes to inspect" in the signed-in official's district (Phase 6B, no AI).
import { NextResponse } from "next/server";
import { requireOfficial } from "@/lib/official/guard.ts";
import { slopesToInspect } from "@/lib/slope/inspect.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  try {
    return NextResponse.json({ ok: true, data: await slopesToInspect(official.district.name) });
  } catch (err) {
    console.error("[official] slopes failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: [], degraded: "Slope list unavailable right now" });
  }
}
