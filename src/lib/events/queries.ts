// Server-only: open (unresolved) events in a bounding box, shaped for the map and the route planner.
import { select } from "../db/supabase.ts";
import type { EventStatus, MapEvent } from "./types.ts";

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

/** Throws on database errors; callers decide how to degrade. */
export async function openEventsInBbox(w: number, s: number, e: number, n: number, limit = 300): Promise<MapEvent[]> {
  const rows = await select<Row>(
    "events",
    "select=id,type,status,place_name,lat,lng,summary,confidence,last_confirmed_at,sources,models_agreed," +
      "road_segments(road_ref,road_name),photos(annotated_url,public_url)" +
      `&resolved_at=is.null&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}` +
      `&order=last_confirmed_at.desc&limit=${limit}`,
  );
  return rows.map((r) => ({
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
}
