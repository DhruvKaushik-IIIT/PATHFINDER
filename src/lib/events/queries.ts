// Server-only: open (unresolved) events in a bounding box, shaped for the map and the route planner.
import { select } from "../db/supabase.ts";
import type { EventStatus, MapEvent } from "./types.ts";
import { lifecycleOf } from "./lifecycle.ts";
import { maybeSweepExpired } from "./expire.ts";

export interface EventRow {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  confidence: number;
  last_confirmed_at: string;
  sources: { reports?: number; official?: number; news?: number } | null;
  models_agreed: number | null;
  eta_clear: { earliest: string; latest: string } | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
  photos: { annotated_url: string | null; public_url: string | null; created_at?: string }[];
  measurements?: { roadWidthLeftM?: { min: number; max: number } | null; potholeSize?: string | null; [k: string]: unknown } | null;
  is_demo?: boolean | null;
}

/** Throws on database errors; callers decide how to degrade. */
export async function openEventsInBbox(w: number, s: number, e: number, n: number, limit = 300): Promise<MapEvent[]> {
  const rows = await select<EventRow>(
    "events",
    `select=${EVENT_SELECT}` +
      `&resolved_at=is.null&lat=gte.${s}&lat=lte.${n}&lng=gte.${w}&lng=lte.${e}` +
      `&order=last_confirmed_at.desc&limit=${limit}`,
  );
  maybeSweepExpired();
  // Past its shelf life but not closed yet (the sweep runs at most every 10 min; events with a crew
  // on them are never auto-closed) → shown as Unconfirmed, never as a confirmed disruption.
  return rows
    .map(toMapEvent)
    .map((e) => (e.lifecycle?.state === "expired" ? { ...e, lifecycle: { ...e.lifecycle, state: "unconfirmed" as const } } : e));
}

export const EVENT_SELECT =
  "id,type,status,place_name,lat,lng,summary,confidence,last_confirmed_at,sources,models_agreed,eta_clear," +
  "road_segments(road_ref,road_name),photos(annotated_url,public_url,created_at),measurements,is_demo";

export function toMapEvent(r: EventRow): MapEvent {
  const life = lifecycleOf({
    type: r.type, status: r.status, lastConfirmedAt: r.last_confirmed_at, reports: r.sources?.reports,
    official: r.sources?.official, news: r.sources?.news, isDemo: r.is_demo, etaClear: r.eta_clear,
    potholeSize: r.measurements?.potholeSize ?? null,
  });
  return {
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
    news: r.sources?.news ?? 0,
    modelsAgreed: r.models_agreed,
    etaClear: r.eta_clear,
    photoUrl: r.photos.find((p) => p.annotated_url)?.annotated_url ?? r.photos[0]?.public_url ?? null,
    // Vehicle-fit pills (Phase 6C): the measured gap + when the newest photo was taken.
    gapM: r.measurements?.roadWidthLeftM ?? null,
    lifecycle: { state: life.state, reason: life.reason, unconfirmedAt: life.unconfirmedAt, expiresAt: life.expiresAt },
    photoAt: r.photos.reduce<string | null>((a, p) => (p.created_at && (!a || p.created_at > a) ? p.created_at : a), null),
  };
}
