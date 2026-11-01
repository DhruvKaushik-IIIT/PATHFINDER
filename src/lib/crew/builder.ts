// Server-only: the crew builder (Option B Part C). Plain code picks the crew; the AI only writes a note.
//  1. needs   = siteNeeds(event)                       (lib/crew/needs.ts — from measured debris m³)
//  2. people  = nearest ON-DUTY, unassigned workers by skill (duty position < 12 h old, else their depot)
//  3. machines= nearest free machines by kind (backhoe ≈ excavator for digging)
//  4. office approves → crew row (kind assembled, status dispatched) + workers/machines linked +
//     one alert per worker ("Your crew is sent to …") + a timeline line travellers can see.
// Travel time = straight line × 1.4 (hill roads) at 25 km/h for people, 18 km/h for machines.
import { crewBrief } from "../ai/router.ts";
import type { CrewBrief } from "../ai/schemas.ts";
import { insert, select, update } from "../db/supabase.ts";
import type { Official } from "../official/auth.ts";
import { kmBetween } from "../official/districts.ts";
import { roadLabel } from "../official/queue.ts";
import type { QueueItem } from "../official/types.ts";
import { eventTitle, type EventStatus } from "../events/types.ts";
import { DIGGING, machinesText, peopleText, siteNeeds, SKILL_WORD, type MachineKind, type Needs, type Skill } from "./needs.ts";

type NeedsMeasurements = Parameters<typeof siteNeeds>[0]["measurements"];

const ROAD_FACTOR = 1.4;
const PEOPLE_KMH = 25;
const MACHINE_KMH = 18;
const MAX_KM = 70; // straight-line search radius around the site
const FRESH_MS = 12 * 3_600_000;

export class CrewError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface EventRow {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  measurements: Parameters<typeof siteNeeds>[0]["measurements"];
  is_demo: boolean;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
}
interface WorkerRow {
  id: string;
  user_id: string | null;
  name: string;
  skill: Skill;
  base_name: string | null;
  base_lat: number;
  base_lng: number;
  duty_lat: number | null;
  duty_lng: number | null;
  duty_updated_at: string | null;
}
interface MachineRow {
  id: string;
  code: string;
  kind: MachineKind;
  label: string;
  depot_name: string | null;
  lat: number;
  lng: number;
}

export interface PickedPerson {
  id: string;
  lat: number;
  lng: number;
  name: string;
  skill: Skill;
  km: number;
  minutes: number;
  from: string;
}
export interface PickedMachine {
  id: string;
  lat: number;
  lng: number;
  code: string;
  kind: MachineKind;
  label: string;
  km: number;
  minutes: number;
  from: string;
}
export interface CrewProposal {
  event: { id: string; title: string; type: string; status: EventStatus; road: string | null; lat: number; lng: number };
  needs: Needs;
  needsText: { machines: string; people: string };
  people: PickedPerson[];
  machines: PickedMachine[];
  /** "1 helper, 1 tipper" — what nobody on duty nearby could fill. */
  shortfall: string | null;
  /** Minutes until the whole crew is on site (slowest person / machine). */
  readyInMin: number | null;
  /** A crew already working there → no new proposal. */
  existingCrew: { id: string; name: string } | null;
}

const kmRoad = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.round(kmBetween(a, b) * ROAD_FACTOR * 10) / 10;
const mins = (km: number, kmh: number) => Math.max(5, Math.round(((km / kmh) * 60) / 5) * 5);

async function loadEvent(official: Official, eventId: string): Promise<EventRow> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new CrewError("invalid event id");
  const [e] = await select<EventRow>(
    "events",
    `select=id,type,status,place_name,lat,lng,measurements,is_demo,road_segments(road_ref,road_name)&id=eq.${eventId}&resolved_at=is.null&limit=1`,
  );
  if (!e || kmBetween(e, official.district) > official.district.radiusKm) throw new CrewError("Event not found in your district (or already cleared).", 404);
  return e;
}

export async function proposeCrew(official: Official, eventId: string, now = Date.now()): Promise<CrewProposal> {
  const e = await loadEvent(official, eventId);
  const event = { id: e.id, title: eventTitle(e.type, e.place_name), type: e.type, status: e.status, road: roadLabel(e.road_segments?.road_ref ?? e.road_segments?.road_name ?? null), lat: e.lat, lng: e.lng };
  const needs = siteNeeds({ type: e.type, status: e.status, measurements: e.measurements });
  const needsText = { machines: machinesText(needs.machines), people: peopleText(needs.people) };

  const [existing] = await select<{ id: string; name: string }>("crews", `select=id,name&current_event_id=eq.${e.id}&status=in.(dispatched,on_site)&limit=1`);
  if (existing) return { event, needs, needsText, people: [], machines: [], shortfall: null, readyInMin: null, existingCrew: existing };

  // Demo accounts only ever pick demo people/machines (and real accounts never pick demo ones).
  const demo = `&is_demo=is.${official.isDemo}`;
  const [workers, machines] = await Promise.all([
    select<WorkerRow>("workers", `select=id,user_id,name,skill,base_name,base_lat,base_lng,duty_lat,duty_lng,duty_updated_at&on_duty=is.true&crew_id=is.null${demo}&limit=1000`),
    select<MachineRow>("machines", `select=id,code,kind,label,depot_name,lat,lng&available=is.true&crew_id=is.null${demo}&limit=500`),
  ]);

  const people: PickedPerson[] = [];
  const short: string[] = [];
  for (const skill of ["supervisor", "operator", "driver", "helper", "marshal"] as Skill[]) {
    const n = needs.people[skill];
    if (!n) continue;
    const cands = workers
      .filter((w) => w.skill === skill)
      .map((w) => {
        const fresh = w.duty_lat != null && w.duty_lng != null && w.duty_updated_at && now - new Date(w.duty_updated_at).getTime() < FRESH_MS;
        const at = fresh ? { lat: w.duty_lat!, lng: w.duty_lng! } : { lat: w.base_lat, lng: w.base_lng };
        const km = kmRoad(at, e);
        return { id: w.id, lat: at.lat, lng: at.lng, name: w.name, skill, km, minutes: mins(km, PEOPLE_KMH), from: fresh ? "on duty nearby" : (w.base_name ?? "depot") };
      })
      .filter((c) => c.km <= MAX_KM * ROAD_FACTOR)
      .sort((a, b) => a.km - b.km);
    people.push(...cands.slice(0, n));
    if (cands.length < n) short.push(`${n - cands.length} ${SKILL_WORD[skill][n - cands.length > 1 ? 1 : 0]}`);
  }

  const picked: PickedMachine[] = [];
  const want: [keyof Needs["machines"], MachineKind[], string][] = [
    ["digging", DIGGING, "JCB / excavator"],
    ["tipper", ["tipper"], "tipper"],
    ["rock_breaker", ["rock_breaker"], "rock breaker"],
    ["snow_cutter", ["snow_cutter"], "snow cutter"],
    ["loader", ["loader", "dozer"], "loader"],
  ];
  for (const [k, kinds, word] of want) {
    const n = needs.machines[k];
    if (!n) continue;
    const cands = machines
      .filter((m) => kinds.includes(m.kind) && !picked.some((p) => p.id === m.id))
      .map((m) => {
        const km = kmRoad(m, e);
        return { id: m.id, lat: m.lat, lng: m.lng, code: m.code, kind: m.kind, label: m.label, km, minutes: mins(km, MACHINE_KMH), from: m.depot_name ?? "depot" };
      })
      .filter((c) => c.km <= MAX_KM * ROAD_FACTOR)
      .sort((a, b) => a.km - b.km);
    picked.push(...cands.slice(0, n));
    if (cands.length < n) short.push(`${n - cands.length} ${word}${n - cands.length > 1 ? "s" : ""}`);
  }

  const all = [...people.map((p) => p.minutes), ...picked.map((m) => m.minutes)];
  return {
    event,
    needs,
    needsText,
    people,
    machines: picked,
    shortfall: short.length ? short.join(", ") : null,
    readyInMin: all.length ? Math.max(...all) : null,
    existingCrew: null,
  };
}

const IST_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const ist = (d: Date) => IST_FMT.format(d).replace(/\s?(am|pm)\b/gi, (m) => ` ${m.trim().toUpperCase()}`);
const readyText = (m: number | null) => (m == null ? null : m < 60 ? `~${m} min` : `~${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim());

/** Code template (no AI) — also the last resort when both providers are down. */
export function briefTemplate(p: CrewProposal): CrewBrief {
  const ready = readyText(p.readyInMin);
  const why = `${p.event.title} needs ${p.needsText.machines || "no machines"} and ${p.needs.totalPeople} people. These are the nearest on-duty workers and free machines${ready ? `; the whole crew can be on site in ${ready}` : ""}.${p.shortfall ? ` Short: ${p.shortfall}.` : ""}`;
  return { why, whyHi: "", safety: p.event.status === "closed" ? ["Hold traffic at both ends while machines work."] : ["Keep one lane moving with marshals at both ends."] };
}

const BRIEF_TTL = 30 * 60_000;
const briefCache = new Map<string, { at: number; brief: CrewBrief; by: string }>();

/** Short "why this crew" + safety points (Baseten → Meta → template). Cached 30 min per proposal. */
export async function briefFor(p: CrewProposal): Promise<{ brief: CrewBrief; by: string }> {
  const key = [p.event.id, p.event.status, ...p.people.map((x) => x.id), ...p.machines.map((x) => x.id)].join("|");
  const hit = briefCache.get(key);
  if (hit && Date.now() - hit.at < BRIEF_TTL) return hit;
  const r = await crewBrief(
    {
      site: p.event.title,
      road: p.event.road,
      status: p.event.status,
      type: p.event.type,
      needs: `${p.needsText.machines || "no machines"}; ${p.needsText.people}`,
      reasons: p.needs.reasons,
      people: p.people.map((x) => `${x.name} (${SKILL_WORD[x.skill][0]}, ${x.km} km)`).join(", "),
      machines: p.machines.map((m) => `${m.code} ${m.label} (${m.km} km)`).join(", "),
      readyIn: readyText(p.readyInMin),
      shortfall: p.shortfall,
      rain: null,
    },
    () => briefTemplate(p),
  );
  const brief = { ...r.data, safety: r.data.safety.slice(0, 3) };
  // Hindi must actually be Devanagari; otherwise hide it rather than show something wrong.
  if ((brief.whyHi.match(/[ऀ-ॿ]/g) ?? []).length < 10) brief.whyHi = "";
  const out = { brief, by: r.source === "none" ? "code" : r.source };
  if (out.by !== "code") briefCache.set(key, { at: Date.now(), ...out });
  return out;
}

/** Approve: re-check every pick is still free, create the crew, link people + machines, alert each worker. */
export async function approveCrew(official: Official, eventId: string, workerIds: string[], machineIds: string[]): Promise<{ crewId: string; name: string; alerted: number }> {
  if (official.role === "crew") throw new CrewError("Crew accounts can't dispatch.", 403);
  if (!workerIds.length) throw new CrewError("Pick at least one person.");
  const p = await proposeCrew(official, eventId);
  if (p.existingCrew) throw new CrewError(`${p.existingCrew.name} is already working here.`, 409);
  const demo = `&is_demo=is.${official.isDemo}`;
  const [ws, ms] = await Promise.all([
    select<{ id: string; user_id: string | null; name: string; skill: Skill }>("workers", `select=id,user_id,name,skill&id=in.(${workerIds.join(",")})&on_duty=is.true&crew_id=is.null${demo}`),
    machineIds.length
      ? select<{ id: string; code: string; label: string }>("machines", `select=id,code,label&id=in.(${machineIds.join(",")})&available=is.true&crew_id=is.null${demo}`)
      : Promise.resolve([] as { id: string; code: string; label: string }[]),
  ]);
  if (ws.length !== workerIds.length || ms.length !== machineIds.length) throw new CrewError("Someone or a machine was just assigned elsewhere — refresh to get a new proposal.", 409);

  const now = new Date();
  const place = p.event.title.replace(/^.* (at|near) /, "");
  const sup = ws.find((w) => w.skill === "supervisor") ?? null;
  const picked = p.people.filter((x) => workerIds.includes(x.id));
  const pickedM = p.machines.filter((x) => machineIds.includes(x.id));
  const readyMin = Math.max(5, ...picked.map((x) => x.minutes), ...pickedM.map((x) => x.minutes));
  const eta = new Date(now.getTime() + readyMin * 60_000);
  const [crew] = await insert<{ id: string; name: string }>("crews", {
    org: official.org,
    district: official.district.name,
    name: `Crew ${place}`,
    kind: "assembled",
    status: "dispatched",
    available: false,
    current_event_id: p.event.id,
    supervisor_id: sup?.id ?? null,
    machines: ms.map((m) => `${m.code} ${m.label}`),
    plan: { needs: p.needs, people: picked, machines: pickedM, shortfall: p.shortfall, approvedBy: official.name, readyInMin: readyMin },
    dispatched_at: now.toISOString(),
    is_demo: official.isDemo,
  });
  if (!crew) throw new Error("crew insert returned nothing");
  await Promise.all([
    update("workers", `id=in.(${workerIds.join(",")})`, { crew_id: crew.id }),
    machineIds.length ? update("machines", `id=in.(${machineIds.join(",")})`, { crew_id: crew.id, available: false }) : Promise.resolve([]),
  ]);

  const machinesLine = ms.length ? ms.map((m) => m.code).join(", ") : "no machines";
  const alerts = ws
    .filter((w) => w.user_id)
    .map((w) => ({
      user_id: w.user_id,
      kind: "info",
      title: `Your crew is sent to ${p.event.title}`,
      body: `You: ${SKILL_WORD[w.skill][0]}. ${p.event.road ? `${p.event.road} · ` : ""}${crew.name}, ${ws.length} people · ${machinesLine}.${sup && sup.id !== w.id ? ` Supervisor: ${sup.name}.` : ""} Be on site by ~${ist(eta)}. Open My job for directions.`,
      data: { crewJob: true, crewId: crew.id, eventId: p.event.id, url: "/crew" },
      is_demo: official.isDemo,
    }));
  if (alerts.length) await insert("alerts", alerts);
  await insert("event_timeline", {
    event_id: p.event.id,
    at: now.toISOString(),
    kind: "official",
    text: `${crew.name} sent: ${ws.length} people, ${machinesLine}. Expected on site ~${ist(eta)}.`,
    actor: official.org,
    is_demo: official.isDemo,
  });
  return { crewId: crew.id, name: crew.name, alerted: alerts.length };
}

/** Assembled crews go back to the pool when the road is fully open (standing gangs stay together). */
export async function releaseCrew(crewId: string, at: { lat: number; lng: number }): Promise<void> {
  const [c] = await select<{ kind: string }>("crews", `select=kind&id=eq.${crewId}&limit=1`);
  if (c?.kind !== "assembled") return;
  await Promise.all([
    update("workers", `crew_id=eq.${crewId}`, { crew_id: null }),
    update("machines", `crew_id=eq.${crewId}`, { crew_id: null, available: true, lat: at.lat, lng: at.lng }),
  ]);
}

// ---------------------------------------------------------------- the Command Centre's crew board

export interface CrewBoardItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  eventId: string;
  eventTitle: string;
  people: number;
  machines: string[];
  dispatchedAt: string | null;
  acknowledgedAt: string | null;
  arrivedAt: string | null;
  pct: number | null;
  lastUpdateAt: string | null;
}
export interface ToStaffItem {
  eventId: string;
  title: string;
  status: EventStatus;
  road: string | null;
  needs: { machines: string; people: number };
}

export async function crewBoard(official: Official, queue: QueueItem[]): Promise<{ active: CrewBoardItem[]; toStaff: ToStaffItem[]; onDutyFree: number }> {
  const crews = await select<{
    id: string;
    name: string;
    kind: string;
    status: string;
    current_event_id: string;
    dispatched_at: string | null;
    acknowledged_at: string | null;
    arrived_at: string | null;
    machines: string[] | null;
    events: { type: string; place_name: string | null } | null;
  }>(
    "crews",
    `select=id,name,kind,status,current_event_id,dispatched_at,acknowledged_at,arrived_at,machines,events!crews_current_event_id_fkey(type,place_name)&district=eq.${encodeURIComponent(official.district.name)}&current_event_id=not.is.null&order=dispatched_at.desc.nullslast`,
  );
  const ids = crews.map((c) => c.id);
  const evIds = crews.map((c) => c.current_event_id);
  const [members, updates, free] = await Promise.all([
    ids.length ? select<{ crew_id: string }>("workers", `select=crew_id&crew_id=in.(${ids.join(",")})`) : Promise.resolve([] as { crew_id: string }[]),
    evIds.length
      ? select<{ event_id: string; pct_cleared: number | null; created_at: string }>("official_updates", `select=event_id,pct_cleared,created_at&event_id=in.(${evIds.join(",")})&order=created_at.desc`)
      : Promise.resolve([] as { event_id: string; pct_cleared: number | null; created_at: string }[]),
    select<{ id: string }>("workers", `select=id&on_duty=is.true&crew_id=is.null&district=eq.${encodeURIComponent(official.district.name)}&is_demo=is.${official.isDemo}`),
  ]);
  const active: CrewBoardItem[] = crews.map((c) => {
    const u = updates.find((x) => x.event_id === c.current_event_id);
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      eventId: c.current_event_id,
      eventTitle: eventTitle(c.events?.type ?? "other", c.events?.place_name ?? null),
      people: members.filter((m) => m.crew_id === c.id).length,
      machines: (c.machines ?? []).map((m) => m.split(" ")[0]!),
      dispatchedAt: c.dispatched_at,
      acknowledgedAt: c.acknowledged_at,
      arrivedAt: c.arrived_at,
      pct: u?.pct_cleared ?? null,
      lastUpdateAt: u?.created_at ?? null,
    };
  });
  const staffed = new Set(evIds);
  const top = queue.filter((q) => !staffed.has(q.event.id) && q.status !== "open").slice(0, 3);
  // Same needs as the builder screen: use each event's full measurements (length, % blocked, m³).
  const meas = top.length
    ? await select<{ id: string; measurements: NeedsMeasurements }>("events", `select=id,measurements&id=in.(${top.map((q) => q.event.id).join(",")})`)
    : [];
  const toStaff: ToStaffItem[] = top.map((q) => {
    const n = siteNeeds({ type: q.event.type, status: q.status, measurements: meas.find((m) => m.id === q.event.id)?.measurements ?? { debrisVolumeM3: q.debrisM3 } });
    return {
      eventId: q.event.id,
      title: eventTitle(q.event.type, q.event.placeName),
      status: q.status,
      road: q.road,
      needs: { machines: machinesText(n.machines), people: n.totalPeople },
    };
  });
  return { active, toStaff, onDutyFree: free.length };
}
