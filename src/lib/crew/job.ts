// Server-only: the on-site worker's side (Option B Part B). "My job" for a signed-in crew account,
// On duty / Off duty (location shared only while on duty, rounded to ~100 m, overwritten — no history),
// and the job steps the office follows: opened → arrived. "Job done" is the final field update
// (photo required, "Fully open"), which already resolves the event and frees the crew.
import { insert, select, update } from "../db/supabase.ts";
import type { Official } from "../official/auth.ts";
import { roadLabel } from "../official/queue.ts";
import { eventTitle, type EventStatus } from "../events/types.ts";
import type { Skill } from "./needs.ts";

type Crew = Official & { worker: NonNullable<Official["worker"]> };

export interface MyJob {
  worker: { id: string; name: string; skill: Skill; org: string; baseName: string | null; onDuty: boolean; dutyUpdatedAt: string | null; position: { lat: number; lng: number } | null };
  crew: {
    id: string;
    name: string;
    status: string;
    supervisor: string | null;
    dispatchedAt: string | null;
    acknowledgedAt: string | null;
    arrivedAt: string | null;
    members: { name: string; skill: Skill; you: boolean }[];
    machines: { code: string; label: string }[];
  } | null;
  job: {
    eventId: string;
    title: string;
    type: string;
    status: EventStatus;
    place: string | null;
    road: string | null;
    lat: number;
    lng: number;
    summary: string | null;
    etaClear: { earliest: string; latest: string } | null;
    lastUpdate: { pct: number | null; at: string } | null;
  } | null;
}

interface WorkerRow {
  id: string;
  name: string;
  skill: Skill;
  org: string;
  base_name: string | null;
  on_duty: boolean;
  duty_updated_at: string | null;
  duty_lat: number | null;
  duty_lng: number | null;
  crew_id: string | null;
}
interface CrewRow {
  id: string;
  name: string;
  status: string;
  current_event_id: string | null;
  dispatched_at: string | null;
  acknowledged_at: string | null;
  arrived_at: string | null;
  supervisor: { name: string } | null;
}
interface EventRow {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  eta_clear: { earliest: string; latest: string } | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
}

export async function myJob(who: Crew): Promise<MyJob> {
  const [w] = await select<WorkerRow>("workers", `select=id,name,skill,org,base_name,on_duty,duty_updated_at,duty_lat,duty_lng,crew_id&id=eq.${who.worker.id}&limit=1`);
  if (!w) throw new Error("worker row missing");
  const worker: MyJob["worker"] = {
    id: w.id,
    name: w.name,
    skill: w.skill,
    org: w.org,
    baseName: w.base_name,
    onDuty: w.on_duty,
    dutyUpdatedAt: w.duty_updated_at,
    position: w.on_duty && w.duty_lat != null && w.duty_lng != null ? { lat: w.duty_lat, lng: w.duty_lng } : null,
  };
  if (!w.crew_id) return { worker, crew: null, job: null };

  const [c] = await select<CrewRow>(
    "crews",
    `select=id,name,status,current_event_id,dispatched_at,acknowledged_at,arrived_at,supervisor:workers!crews_supervisor_id_fkey(name)&id=eq.${w.crew_id}&limit=1`,
  );
  if (!c) return { worker, crew: null, job: null };
  const [members, machines, events, updates] = await Promise.all([
    select<{ id: string; name: string; skill: Skill }>("workers", `select=id,name,skill&crew_id=eq.${c.id}&order=skill,name`),
    select<{ code: string; label: string }>("machines", `select=code,label&crew_id=eq.${c.id}&order=code`),
    c.current_event_id
      ? select<EventRow>(
          "events",
          `select=id,type,status,place_name,lat,lng,summary,eta_clear,road_segments(road_ref,road_name)&id=eq.${c.current_event_id}&resolved_at=is.null&limit=1`,
        )
      : Promise.resolve([] as EventRow[]),
    c.current_event_id
      ? select<{ pct_cleared: number | null; created_at: string }>("official_updates", `select=pct_cleared,created_at&event_id=eq.${c.current_event_id}&order=created_at.desc&limit=1`)
      : Promise.resolve([] as { pct_cleared: number | null; created_at: string }[]),
  ]);
  const order: Skill[] = ["supervisor", "operator", "driver", "helper", "marshal"];
  const crew: MyJob["crew"] = {
    id: c.id,
    name: c.name,
    status: c.status,
    supervisor: c.supervisor?.name ?? null,
    dispatchedAt: c.dispatched_at,
    acknowledgedAt: c.acknowledged_at,
    arrivedAt: c.arrived_at,
    members: members.map((m) => ({ name: m.name, skill: m.skill, you: m.id === w.id })).sort((a, b) => order.indexOf(a.skill) - order.indexOf(b.skill)),
    machines,
  };
  const e = events[0];
  const job: MyJob["job"] = e
    ? {
        eventId: e.id,
        title: eventTitle(e.type, e.place_name),
        type: e.type,
        status: e.status,
        place: e.place_name,
        road: roadLabel(e.road_segments?.road_ref ?? e.road_segments?.road_name ?? null),
        lat: e.lat,
        lng: e.lng,
        summary: e.summary,
        etaClear: e.eta_clear,
        lastUpdate: updates[0] ? { pct: updates[0].pct_cleared, at: updates[0].created_at } : null,
      }
    : null;
  return { worker, crew, job };
}

/** On duty: store the position rounded to ~100 m (overwritten, no history). Off duty: forget it. */
export async function setDuty(who: Crew, onDuty: boolean, pos: { lat: number; lng: number } | null): Promise<void> {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  await update(
    "workers",
    `id=eq.${who.worker.id}`,
    onDuty
      ? { on_duty: true, ...(pos && { duty_lat: r(pos.lat), duty_lng: r(pos.lng) }), duty_updated_at: new Date().toISOString() }
      : { on_duty: false, duty_lat: null, duty_lng: null, duty_updated_at: null },
  );
}

/** "opened" (first crew member saw the job) / "arrived" (crew on site). Adds a timeline line for the office + travellers. */
export async function markStep(who: Crew, step: "opened" | "arrived"): Promise<{ changed: boolean }> {
  const { crewId, eventId } = who.worker;
  if (!crewId || !eventId) return { changed: false };
  const [c] = await select<{ id: string; name: string; org: string; status: string; acknowledged_at: string | null; arrived_at: string | null }>(
    "crews",
    `select=id,name,org,status,acknowledged_at,arrived_at&id=eq.${crewId}&limit=1`,
  );
  if (!c) return { changed: false };
  const now = new Date().toISOString();
  if (step === "opened") {
    if (c.acknowledged_at) return { changed: false };
    await update("crews", `id=eq.${crewId}`, { acknowledged_at: now });
    return { changed: true };
  }
  if (c.arrived_at) return { changed: false };
  await update("crews", `id=eq.${crewId}`, { arrived_at: now, status: "on_site", ...(!c.acknowledged_at && { acknowledged_at: now }) });
  await insert("event_timeline", {
    event_id: eventId,
    at: now,
    kind: "official",
    text: `${c.name} arrived on site (${who.name}).`,
    actor: `${c.org} · ${c.name}`,
    is_demo: who.isDemo,
  });
  return { changed: true };
}
