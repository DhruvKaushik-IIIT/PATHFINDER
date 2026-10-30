// GET /api/events?bbox=W,S,E,N → open (unresolved) events inside the box, for map pins.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { openEventsInBbox } from "@/lib/events/queries.ts";

export const dynamic = "force-dynamic";

const Bbox = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]));

export async function GET(req: Request) {
  const parsed = Bbox.safeParse(new URL(req.url).searchParams.get("bbox") ?? "");
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bbox=W,S,E,N required" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: [], degraded: "database not configured" });
  try {
    // Public map data: a short CDN cache absorbs many phones panning the same area (Phase 6E).
    return NextResponse.json({ ok: true, data: await openEventsInBbox(...parsed.data) }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } });
  } catch (err) {
    console.error("[events] query failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: [], degraded: "events unavailable right now" });
  }
}
