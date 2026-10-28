// GET /api/events?bbox=W,S,E,N → open (unresolved) events inside the box, for map pins.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, select } from "@/lib/db/supabase.ts";
import type { EventStatus, MapEvent } from "@/lib/events/types.ts";

export const dynamic = "force-dynamic";

const Bbox = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]));

interface Row {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  confidence: number;
  last_confirmed_at: string;
  sources: { reports?: number } | null;
  models_agreed: number | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
  photos: { annotated_url: string | null; public_url: string | null }[];
}

export async function GET(req: Request) {
  const parsed = Bbox.safeParse(new URL(req.url).searchParams.get("bbox") ?? "");
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bbox=W,S,E,N required" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: [], degraded: "database not configured" });
  const [w, s, e, n] = parsed.data;
  try {
    const rows = await select<Row>(
      "events",
      "select=id,type,status,place_name,lat,lng,summary,confidence,last_confirmed_at,sources,models_agreed," +
        "road_segments(road_ref,road_name),photos(annotated_url,public_url)" +
        `&resolved_at=is.null&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}` +
        "&order=last_confirmed_at.desc&limit=300",
    );
    const data: MapEvent[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      placeName: r.place_name,
      roadRef: r.road_segments?.road_ref ?? r.road_segments?.road_name ?? null,
      lat: r.lat,
      lng: r.lng,
      summary: r.summary,
      confidence: r.confidence,
      lastConfirmedAt: r.last_confirmed_at,
      reports: r.sources?.reports ?? 0,
      modelsAgreed: r.models_agreed,
      photoUrl: r.photos.find((p) => p.annotated_url)?.annotated_url ?? r.photos[0]?.public_url ?? null,
    }));
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[events] query failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: [], degraded: "events unavailable right now" });
  }
}
