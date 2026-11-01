// POST /api/crew/step {step: "opened" | "arrived"} → the office sees the crew open the job / reach the site.
import { NextResponse } from "next/server";
import { z } from "zod";
import { markStep } from "@/lib/crew/job.ts";
import { requireCrew } from "@/lib/official/guard.ts";

export const dynamic = "force-dynamic";

const Body = z.object({ step: z.enum(["opened", "arrived"]) });

export async function POST(req: Request) {
  const who = await requireCrew();
  if (who instanceof NextResponse) return who;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ ok: false, error: "step must be opened or arrived" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, data: await markStep(who, b.data.step) });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "crew_step_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: false, error: "Couldn't save that right now" }, { status: 503 });
  }
}
