// GET /api/snap?lat&lng → nearest road + place name, for the "Near Aut, NH-3" pill on /report. No AI.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { snapToRoad } from "@/lib/geo/snap.ts";

export const dynamic = "force-dynamic";

const Q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

export async function GET(req: Request) {
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ ok: false, error: "lat and lng required" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: { placeName: null, roadRef: null }, degraded: "database not configured" });
  const { segment, placeName } = await snapToRoad(q.data.lat, q.data.lng);
  return NextResponse.json({
    ok: true,
    data: { placeName, roadRef: segment?.road_ref ?? segment?.road_name ?? null, distanceM: segment ? Math.round(segment.distance_m) : null },
  });
}
