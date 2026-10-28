// GET /api/places?q= → place autocomplete (our HP places + Photon). No AI.
import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/geo/places.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  const { places, degraded } = await searchPlaces(q);
  return NextResponse.json({ ok: true, data: places, ...(degraded && { degraded }) });
}
