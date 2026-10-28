// GET /api/risk/route?from=lat,lng&to=lat,lng[&fromName&toName&depart][&replay=1] → RouteRisk (no AI).
// Reuses the planner's 3-min plan cache, so after /api/route this costs one Open-Meteo request.
import { NextResponse } from "next/server";
import { z } from "zod";
import { planRoute } from "@/lib/geo/route.ts";
import { replayAvailable, routeRisk } from "@/lib/risk/forecast.ts";

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
  replay: z.enum(["0", "1"]).optional(),
});

export async function GET(req: Request) {
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ ok: false, error: "from=lat,lng and to=lat,lng required" }, { status: 400 });
  const { from, to, fromName, toName, depart } = q.data;
  const replay = q.data.replay === "1" && replayAvailable() !== null;
  try {
    // Same names as /api/route so the plan cache hits.
    const plan = await planRoute(
      { name: fromName || "Start", lat: from[0], lng: from[1] },
      { name: toName || "Destination", lat: to[0], lng: to[1] },
      depart ? new Date(depart) : new Date(),
    );
    const data = await routeRisk(plan, { replay });
    return NextResponse.json({ ok: true, data, ...(q.data.replay === "1" && !replay && { degraded: "no weather replay saved — showing the live forecast" }) });
  } catch (err) {
    console.error("[risk/route] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "Rain forecast unavailable right now" });
  }
}
