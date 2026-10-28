// GET /api/route?from=lat,lng&to=lat,lng[&fromName=&toName=&depart=ISO] → RoutePlan.
// No AI here (7.5b): OSRM + HP split + events on route + code verdict. Route Check agent = Part B.
import { NextResponse } from "next/server";
import { z } from "zod";
import { planRoute } from "@/lib/geo/route.ts";
import { nearestPlace } from "@/lib/geo/snap.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LatLng = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]));

const Q = z.object({
  from: LatLng,
  to: LatLng,
  fromName: z.string().trim().max(80).optional(),
  toName: z.string().trim().max(80).optional(),
  depart: z.iso.datetime({ offset: true }).optional(),
});

export async function GET(req: Request) {
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ ok: false, error: "from=lat,lng and to=lat,lng required" }, { status: 400 });
  const { from, to, fromName, toName, depart } = q.data;
  const [fn, tn] = await Promise.all([
    fromName || nearestPlace(from[0], from[1]).catch(() => null),
    toName || nearestPlace(to[0], to[1]).catch(() => null),
  ]);
  try {
    const { degraded, ...plan } = await planRoute(
      { name: fn || "Start", lat: from[0], lng: from[1] },
      { name: tn || "Destination", lat: to[0], lng: to[1] },
      depart ? new Date(depart) : new Date(),
    );
    return NextResponse.json({ ok: true, data: plan, ...(degraded && { degraded }) });
  } catch (err) {
    console.error("[route] routing failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "Routing is unavailable right now — please try again" });
  }
}
