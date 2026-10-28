// POST /api/route-check {from:"lat,lng", to:"lat,lng", fromName?, toName?, departAt?}
// → { plan (code, no AI), check: RouteVerdict from the Route Check agent (or code when no AI is needed/available) }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRoute } from "@/lib/geo/check.ts";
import { nearestPlace } from "@/lib/geo/snap.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LatLng = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]));

const Body = z.object({
  from: LatLng,
  to: LatLng,
  fromName: z.string().trim().max(80).optional(),
  toName: z.string().trim().max(80).optional(),
  departAt: z.iso.datetime({ offset: true }).optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "from and to (\"lat,lng\") required" }, { status: 400 });
  const { from, to, fromName, toName, departAt } = body.data;
  const [fn, tn] = await Promise.all([
    fromName || nearestPlace(from[0], from[1]).catch(() => null),
    toName || nearestPlace(to[0], to[1]).catch(() => null),
  ]);
  try {
    const { degraded, ...data } = await checkRoute(
      { name: fn || "Start", lat: from[0], lng: from[1] },
      { name: tn || "Destination", lat: to[0], lng: to[1] },
      departAt ? new Date(departAt) : new Date(),
    );
    return NextResponse.json({ ok: true, data, ...(degraded && { degraded }) });
  } catch (err) {
    console.error("[route-check] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "Routing is unavailable right now — please try again" });
  }
}
