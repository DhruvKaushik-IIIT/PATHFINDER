// GET /api/events/[id] → one event with measurements, passability, clearing window, photos and timeline.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, select } from "@/lib/db/supabase.ts";
import type { EventDetail, EventStatus } from "@/lib/events/types.ts";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  summary_hi: string | null;
  confidence: number;
  started_at: string;
  last_confirmed_at: string;
  resolved_at: string | null;
  passable: EventDetail["passable"];
  measurements: EventDetail["measurements"] | null;
  eta_clear: EventDetail["etaClear"];
  sources: Partial<EventDetail["sources"]> | null;
  models_agreed: number | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
  photos: { id: string; public_url: string | null; annotated_url: string | null; created_at: string; source: string; faces_blurred: boolean; width: number | null; height: number | null }[];
  event_timeline: { at: string; kind: string; text: string; actor: string | null }[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, error: "invalid event id" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    const [r] = await select<Row>(
      "events",
      "select=id,type,status,place_name,lat,lng,summary,summary_hi,confidence,started_at,last_confirmed_at,resolved_at," +
        "passable,measurements,eta_clear,sources,models_agreed,road_segments(road_ref,road_name)," +
        "photos(id,public_url,annotated_url,created_at,source,faces_blurred,width,height)," +
        `event_timeline(at,kind,text,actor)&id=eq.${id}&photos.order=created_at.desc&event_timeline.order=at.desc&event_timeline.limit=10`,
    );
    if (!r) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404 });
    const sources = { reports: 0, official: 0, news: 0, notices: 0, ...r.sources };
    const data: EventDetail = {
      id: r.id,
      type: r.type,
      status: r.status,
      placeName: r.place_name,
      roadRef: r.road_segments?.road_ref ?? r.road_segments?.road_name ?? null,
      lat: r.lat,
      lng: r.lng,
      summary: r.summary,
      summaryHi: r.summary_hi,
      confidence: r.confidence,
      lastConfirmedAt: r.last_confirmed_at,
      startedAt: r.started_at,
      resolvedAt: r.resolved_at,
      reports: sources.reports,
      news: sources.news,
      modelsAgreed: r.models_agreed,
      photoUrl: r.photos.find((p) => p.annotated_url)?.annotated_url ?? r.photos[0]?.public_url ?? null,
      passable: r.passable ?? { bike: null, car: null, bus: null },
      measurements: r.measurements ?? {},
      etaClear: r.eta_clear,
      sources,
      photos: r.photos.map((p) => ({
        id: p.id,
        publicUrl: p.public_url,
        annotatedUrl: p.annotated_url,
        createdAt: p.created_at,
        source: p.source,
        facesBlurred: p.faces_blurred,
        width: p.width,
        height: p.height,
      })),
      timeline: r.event_timeline,
    };
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[event] query failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "event details unavailable right now" });
  }
}
