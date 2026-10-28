// GET /api/nearby?lat&lng&radiusKm[&name][&summary=0] → open events within the radius, ranked, + a short summary.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { nearby, RADII_KM } from "@/lib/events/nearby.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().refine((r) => (RADII_KM as readonly number[]).includes(r), "5, 10, 25 or 50").default(25),
  name: z.string().trim().max(80).optional(),
  /** summary=0 → counts + list only, no AI (Home's "Near you right now" row). */
  summary: z.enum(["0", "1"]).default("1"),
});

export async function GET(req: Request) {
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ ok: false, error: "lat, lng and radiusKm (5/10/25/50) required" }, { status: 400 });
  const { lat, lng, radiusKm, name, summary } = q.data;
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    const data = await nearby(lat, lng, radiusKm, { name, summary: summary === "1" });
    return NextResponse.json({ ok: true, data, ...(summary === "1" && data.summaryBy === "code" && data.items.length > 0 && { degraded: "AI summary unavailable right now" }) });
  } catch (err) {
    console.error("[nearby] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "Nearby is unavailable right now" });
  }
}
