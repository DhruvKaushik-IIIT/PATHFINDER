// GET /api/slopes/[id] → a slope site with its checked photos, change lines and latest risk (Phase 6B). No AI.
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { changeLines } from "@/lib/slope/metrics.ts";
import { getSite, siteObservations } from "@/lib/slope/sites.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDb()) return NextResponse.json({ ok: false, error: "database not configured" }, { status: 503 });
  try {
    const site = await getSite(id);
    if (!site) return NextResponse.json({ ok: false, error: "slope site not found" }, { status: 404 });
    const observations = await siteObservations(id, 12);
    return NextResponse.json({ ok: true, data: { site, observations, changes: changeLines(observations) } });
  } catch (err) {
    console.error("[slopes] detail failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "slope site unavailable right now" }, { status: 503 });
  }
}
