// GET /api/watch → this device's watched trips · POST /api/watch {from,to,fromName,toName,departAt?,verdict?} → start watching.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { currentUserId, ensureUserId } from "@/lib/me.ts";
import { listTrips, watchTrip } from "@/lib/watch/roadWatch.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LatLng = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]));

const Body = z.object({
  from: LatLng,
  to: LatLng,
  fromName: z.string().trim().min(1).max(80),
  toName: z.string().trim().min(1).max(80),
  departAt: z.iso.datetime({ offset: true }).nullish(),
  verdict: z
    .object({ verdict: z.enum(["go", "go_with_care", "delay", "avoid"]), headline: z.string().max(200), headlineHi: z.string().max(200).nullish() })
    .nullish(),
});

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: true, data: [], degraded: "database not configured" });
  try {
    const uid = await currentUserId();
    return NextResponse.json({ ok: true, data: uid ? await listTrips(uid) : [] });
  } catch (err) {
    console.error("[watch] list failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: [], degraded: "watched trips unavailable right now" });
  }
}

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "from, to, fromName, toName required" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "database not configured" }, { status: 503 });
  const { from, to, fromName, toName, departAt, verdict } = body.data;
  try {
    const uid = await ensureUserId();
    const trip = await watchTrip(
      uid,
      { name: fromName, lat: from[0], lng: from[1] },
      { name: toName, lat: to[0], lng: to[1] },
      departAt ?? null,
      verdict ?? null,
    );
    return NextResponse.json({ ok: true, data: trip });
  } catch (err) {
    console.error("[watch] create failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "couldn't start watching this trip, please try again" }, { status: 503 });
  }
}
