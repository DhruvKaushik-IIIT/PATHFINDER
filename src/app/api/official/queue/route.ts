// GET /api/official/queue → Command Centre data for the signed-in official's district:
// stat tiles, priority queue ranked by impact (code, no AI), crews. 401 when not signed in.
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { currentOfficial } from "@/lib/official/auth.ts";
import { commandCentre } from "@/lib/official/queue.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "database not configured" }, { status: 503 });
  let official;
  try {
    official = await currentOfficial();
  } catch (err) {
    console.error("[official] session check failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Sign-in service unavailable" }, { status: 503 });
  }
  if (!official) return NextResponse.json({ ok: false, error: "signed out" }, { status: 401 });
  try {
    const data = await commandCentre({ name: official.name, org: official.org, role: official.role, district: official.district });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[official] queue failed:", (err as Error).message);
    return NextResponse.json({
      ok: true,
      data: {
        official: { name: official.name, org: official.org, role: official.role, district: official.district },
        stats: { active: 0, crewsFree: 0, crewsTotal: 0, vehiclesHit: 0, watching: 0 },
        queue: [],
        crews: [],
      },
      degraded: "Queue unavailable right now — showing nothing rather than old data",
    });
  }
}
