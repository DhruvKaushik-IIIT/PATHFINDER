// GET /api/risk/area?lat&lng&radiusKm(5/10/25/50)[&replay=1] → AreaRisk grid for the Nearby rain-risk layer (no AI).
import { NextResponse } from "next/server";
import { z } from "zod";
import { RADII_KM } from "@/lib/events/nearby.ts";
import { areaRisk, replayAvailable } from "@/lib/risk/forecast.ts";

export const dynamic = "force-dynamic";

const Q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().refine((r) => (RADII_KM as readonly number[]).includes(r), "5, 10, 25 or 50").default(25),
  replay: z.enum(["0", "1"]).optional(),
});

export async function GET(req: Request) {
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ ok: false, error: "lat, lng and radiusKm (5/10/25/50) required" }, { status: 400 });
  const replay = q.data.replay === "1" && replayAvailable() !== null;
  try {
    const data = await areaRisk(q.data.lat, q.data.lng, q.data.radiusKm, { replay });
    return NextResponse.json({ ok: true, data, ...(q.data.replay === "1" && !replay && { degraded: "no weather replay saved — showing the live forecast" }) });
  } catch (err) {
    console.error("[risk/area] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "Rain forecast unavailable right now" });
  }
}
