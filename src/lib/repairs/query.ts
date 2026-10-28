// Server-only: repairs for a set of events — crews assigned (crews.current_event_id) and the latest
// official field update per event. Plain database reads, no AI.
import { select } from "../db/supabase.ts";
import { eventTitle, type EventStatus } from "../events/types.ts";
import { roadLabel } from "../official/queue.ts";
import type { Repair } from "./types.ts";

const RECENT_MS = 48 * 3_600_000;
const AT_WORK_MS = 12 * 3_600_000;

interface EventRow {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  eta_clear: { earliest: string; latest: string } | null;
  resolved_at: string | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
}
interface CrewRow {
  name: string;
  org: string;
  machines: string[] | null;
  current_event_id: string;
}
interface UpdateRow {
  event_id: string;
  pct_cleared: number | null;
  eta_full_open: string | null;
  machines: string[] | null;
  ai_check: { level?: Repair["check"]; crew?: string | null; org?: string } | null;
  created_at: string;
}

export async function repairsFor(ids: string[]): Promise<Repair[]> {
  if (!ids.length) return [];
  const list = ids.join(",");
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const [events, crews, updates] = await Promise.all([
    select<EventRow>("events", `select=id,type,status,place_name,eta_clear,resolved_at,road_segments(road_ref,road_name)&id=in.(${list})`),
    select<CrewRow>("crews", `select=name,org,machines,current_event_id&current_event_id=in.(${list})`),
    select<UpdateRow>("official_updates", `select=event_id,pct_cleared,eta_full_open,machines,ai_check,created_at&event_id=in.(${list})&created_at=gte.${since}&order=created_at.desc`),
  ]);
  const out: Repair[] = [];
  for (const id of ids) {
    const e = events.find((x) => x.id === id);
    if (!e) continue;
    const crew = crews.find((c) => c.current_event_id === id) ?? null;
    const last = updates.find((u) => u.event_id === id) ?? null;
    if (!crew && !last) continue;
    const lastAt = last?.created_at ?? null;
    out.push({
      eventId: id,
      title: eventTitle(e.type, e.place_name),
      road: roadLabel(e.road_segments?.road_ref ?? e.road_segments?.road_name ?? null),
      status: e.resolved_at ? "open" : e.status,
      resolved: Boolean(e.resolved_at),
      org: crew?.org ?? last?.ai_check?.org ?? "Road crew",
      crewName: crew?.name ?? last?.ai_check?.crew ?? null,
      machines: last?.machines?.length ? last.machines : (crew?.machines ?? []),
      pctCleared: e.resolved_at ? 100 : (last?.pct_cleared ?? null),
      fullyOpenAt: e.resolved_at ?? last?.eta_full_open ?? e.eta_clear?.latest ?? null,
      lastUpdateAt: lastAt,
      check: last?.ai_check?.level ?? null,
      atWork: !e.resolved_at && (Boolean(crew) || (lastAt !== null && Date.now() - new Date(lastAt).getTime() < AT_WORK_MS)),
    });
  }
  return out;
}
