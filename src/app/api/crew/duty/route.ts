// POST /api/crew/duty {onDuty, lat?, lng?} → Start / end shift. Position (≈100 m) only while on duty.
import { NextResponse } from "next/server";
import { z } from "zod";
import { setDuty } from "@/lib/crew/job.ts";
import { requireCrew } from "@/lib/official/guard.ts";

export const dynamic = "force-dynamic";

const Body = z.object({ onDuty: z.boolean(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() });

export async function POST(req: Request) {
  const who = await requireCrew();
  if (who instanceof NextResponse) return who;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ ok: false, error: "onDuty required" }, { status: 400 });
  const pos = b.data.lat != null && b.data.lng != null ? { lat: b.data.lat, lng: b.data.lng } : null;
  try {
    await setDuty(who, b.data.onDuty, pos);
    return NextResponse.json({ ok: true, data: { onDuty: b.data.onDuty } });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "crew_duty_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: false, error: "Couldn't update your shift right now" }, { status: 503 });
  }
}
