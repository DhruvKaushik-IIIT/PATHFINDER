// POST /api/events/[id]/still-there {answer, lat, lng, speedKmh?} — "Still there?" one-tap answer
// (docs/event-lifecycle.md §2). Plain code, no AI. Only from near the spot (≤2 km), at ≤20 km/h.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";
import { ensureUserId } from "@/lib/me.ts";
import { recordTap, TAP_ANSWERS } from "@/lib/events/stillThere.ts";

export const dynamic = "force-dynamic";

const Body = z.object({
  answer: z.enum(TAP_ANSWERS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(400).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = checkLimit(req, "tap");
  if (limited) return limitedResponse(limited);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, error: "invalid event id" }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid answer" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    const device = await ensureUserId();
    const r = await recordTap({ eventId: id, device, ...body.data, speedKmh: body.data.speedKmh ?? null });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.message }, { status: r.code });
    return NextResponse.json({ ok: true, data: { message: r.message, state: r.state } });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "still_there_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: true, data: null, degraded: "Couldn't save your answer right now" });
  }
}
