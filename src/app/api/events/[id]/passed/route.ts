// POST /api/events/[id]/passed {lat, lng, avgKmh} — Drive Watch drove through this spot (real GPS only).
// Normal speed through a reported spot = free evidence it's open (docs/event-lifecycle.md §3). No AI.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";
import { ensureUserId } from "@/lib/me.ts";
import { recordPass } from "@/lib/events/stillThere.ts";

export const dynamic = "force-dynamic";

const Body = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), avgKmh: z.number().min(0).max(200) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = checkLimit(req, "tap");
  if (limited) return limitedResponse(limited);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, error: "invalid event id" }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "invalid pass" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null });
  try {
    const r = await recordPass({ eventId: id, device: await ensureUserId(), ...body.data });
    return NextResponse.json(r.ok ? { ok: true, data: { message: r.message, state: r.state } } : { ok: false, error: r.message }, { status: r.ok ? 200 : r.code });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", event: "pass_failed", error: (err as Error).message }));
    return NextResponse.json({ ok: true, data: null });
  }
}
