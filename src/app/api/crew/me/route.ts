// GET /api/crew/me → "My job" for the signed-in crew member (no AI).
import { NextResponse } from "next/server";
import { myJob } from "@/lib/crew/job.ts";
import { requireCrew } from "@/lib/official/guard.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const who = await requireCrew();
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json({ ok: true, data: await myJob(who) });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "crew_me_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: false, error: "Couldn't load your job right now" }, { status: 503 });
  }
}
