// GET /api/slopes?bbox=W,S,E,N → slope sites with warning signs (watch+) for map markers (Phase 6B). No AI.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { sitesInBbox, toPin } from "@/lib/slope/sites.ts";

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
    return NextResponse.json({ ok: true, data: (await sitesInBbox(...parsed.data)).map(toPin) });
  } catch (err) {
    console.error("[slopes] query failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: [], degraded: "slope sites unavailable right now" });
  }
}
