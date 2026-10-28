// GET /api/official/queue → Command Centre data for the signed-in official's district:
// stat tiles, priority queue ranked by impact (code, no AI), crews. 401 when not signed in.
import { NextResponse } from "next/server";
import { requireOfficial } from "@/lib/official/guard.ts";
import { commandCentre } from "@/lib/official/queue.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const who = { name: official.name, org: official.org, role: official.role, district: official.district };
  try {
    return NextResponse.json({ ok: true, data: await commandCentre(who) });
  } catch (err) {
    console.error("[official] queue failed:", (err as Error).message);
    return NextResponse.json({
      ok: true,
      data: { official: who, stats: { active: 0, crewsFree: 0, crewsTotal: 0, vehiclesHit: 0, watching: 0 }, queue: [], crews: [] },
      degraded: "Queue unavailable right now — showing nothing rather than old data",
    });
  }
}
