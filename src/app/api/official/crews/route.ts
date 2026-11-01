// GET /api/official/crews → crews at work (sent → opened → on site → % cleared) + the top sites that still need a crew. No AI.
import { NextResponse } from "next/server";
import { crewBoard } from "@/lib/crew/builder.ts";
import { requireOffice } from "@/lib/official/guard.ts";
import { crewsOf, rankedQueue } from "@/lib/official/queue.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const official = await requireOffice();
  if (official instanceof NextResponse) return official;
  try {
    const queue = await rankedQueue(official.district, await crewsOf(official.district));
    return NextResponse.json({ ok: true, data: await crewBoard(official, queue) });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "crew_board_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: true, data: null, degraded: "Crew board unavailable right now" });
  }
}
