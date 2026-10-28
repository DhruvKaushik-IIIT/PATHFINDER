// Server-only: public advisory (frame 14b). Draft EN + HI from the verified event (Baseten → Meta Spark →
// template), count who it reaches (travellers watching a trip through this spot), and Publish: one alert
// per watching device + a timeline item on the event. Officials can only advise inside their district.
import { draftAdvisory } from "../ai/router.ts";
import type { Advisory } from "../ai/schemas.ts";
import { ist } from "../ai/tools/routeCheck.ts";
import { insert, select } from "../db/supabase.ts";
import { eventTitle, STATUS_STYLE, type EventStatus } from "../events/types.ts";
import { clock } from "../geo/format.ts";
import type { Official } from "./auth.ts";
import { kmBetween } from "./districts.ts";
import { roadLabel } from "./queue.ts";

const TTL_MS = 30 * 60_000;
const REPUBLISH_MIN = 10;
const drafts = new Map<string, { at: number; draft: AdvisoryDraft }>();
const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
/** Clearing estimates are rough: "2:30 AM" (today) or "Thu 5:45 PM" — never "2:27 AM". */
const rough = (iso: string) => {
  const d = new Date(Math.round(new Date(iso).getTime() / 900_000) * 900_000);
  const today = DATE.format(new Date()) === DATE.format(d);
  return `${today ? "" : `${DAY.format(d)} `}${clock(d.toISOString())}`;
};

interface EventRow {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  passable: { bike: boolean | null; car: boolean | null; bus: boolean | null } | null;
  eta_clear: { earliest: string; latest: string } | null;
  last_confirmed_at: string;
  resolved_at: string | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
}

export interface AdvisoryEvent {
  id: string;
  title: string;
  road: string | null;
  place: string | null;
  status: EventStatus;
  lat: number;
  lng: number;
}

export interface AdvisoryDraft {
  event: AdvisoryEvent;
  en: string;
  hi: string;
  by: string;
  reach: { travellers: number; trips: number };
}

async function loadEvent(official: Official, eventId: string): Promise<{ row: EventRow; crew: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const [row] = await select<EventRow>(
    "events",
    "select=id,type,status,place_name,lat,lng,summary,passable,eta_clear,last_confirmed_at,resolved_at,road_segments(road_ref,road_name)" +
      `&id=eq.${eventId}&limit=1`,
  );
  if (!row || row.resolved_at || kmBetween(row, official.district) > official.district.radiusKm) return null;
  const [crew] = await select<{ name: string; org: string }>("crews", `select=name,org&current_event_id=eq.${eventId}&limit=1`);
  return { row, crew: crew ? `${crew.name} (${crew.org})` : null };
}

/** Active watched trips that pass this event (listed in their snapshot, or their route box around it). */
async function watchers(e: { id: string; lat: number; lng: number }): Promise<{ userIds: string[]; trips: number }> {
  const rows = await select<{ user_id: string; route_cache: { bbox?: [number, number, number, number]; events?: { id: string }[] } | null }>(
    "watched_trips",
    "select=user_id,route_cache&active=is.true&limit=2000",
  );
  const pad = 0.05;
  const hit = rows.filter((r) => {
    const c = r.route_cache;
    if (c?.events?.some((x) => x.id === e.id)) return true;
    const b = c?.bbox;
    return Boolean(b && e.lng >= b[0] - pad && e.lng <= b[2] + pad && e.lat >= b[1] - pad && e.lat <= b[3] + pad);
  });
  return { userIds: [...new Set(hit.map((r) => r.user_id))], trips: hit.length };
}

function passableText(p: EventRow["passable"]): string {
  if (!p) return "unknown";
  const part = (k: string, v: boolean | null) => `${k} ${v === true ? "yes" : v === false ? "no" : "unknown"}`;
  return [part("bikes", p.bike), part("cars", p.car), part("buses", p.bus)].join(", ");
}

/** Code template — used when no AI is available (5.7 last resort). */
function template(ev: AdvisoryEvent, row: EventRow): Advisory {
  const where = `${ev.road ? `${ev.road} near ` : ""}${ev.place ?? "this spot"}`;
  const state = { open: "open", slow: "slow traffic", one_lane: "one lane open", closed: "closed", unknown: "conditions unclear" }[ev.status];
  const stateHi = { open: "खुला है", slow: "धीमा ट्रैफिक", one_lane: "एक लेन खुली है", closed: "बंद है", unknown: "स्थिति स्पष्ट नहीं" }[ev.status];
  const by = row.eta_clear ? rough(row.eta_clear.latest) : null;
  const bus = row.passable?.bus === false;
  return {
    en: `${where}: ${state}${by ? `, expected to fully reopen by ${by}` : ""}.${bus ? " Buses and trucks please wait." : ""} Verify locally before you travel.`,
    hi: `${where}: ${stateHi}${by ? `, ${by} तक पूरी तरह खुलने की उम्मीद` : ""}।${bus ? " बसें और ट्रक कृपया रुकें।" : ""} यात्रा से पहले स्थानीय जानकारी लें।`,
  };
}

export async function advisoryDraft(official: Official, eventId: string): Promise<{ draft: AdvisoryDraft; degraded?: string } | null> {
  const loaded = await loadEvent(official, eventId);
  if (!loaded) return null;
  const { row, crew } = loaded;
  const road = roadLabel(row.road_segments?.road_ref ?? row.road_segments?.road_name ?? null);
  const event: AdvisoryEvent = { id: row.id, title: eventTitle(row.type, row.place_name), road, place: row.place_name, status: row.status, lat: row.lat, lng: row.lng };
  const w = await watchers(row).catch(() => ({ userIds: [], trips: 0 }));
  const reach = { travellers: w.userIds.length, trips: w.trips };

  const key = `${row.id}:${row.status}:${row.last_confirmed_at}:${crew ?? "-"}`;
  const hit = drafts.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { draft: { ...hit.draft, reach } };

  const res = await draftAdvisory(
    {
      title: event.title,
      road,
      status: STATUS_STYLE[row.status].word.toLowerCase(),
      passable: passableText(row.passable),
      clears: row.eta_clear ? `between ~${rough(row.eta_clear.earliest)} and ~${rough(row.eta_clear.latest)} IST` : null,
      crew,
      summary: row.summary,
      org: official.org,
      now: ist(new Date()),
    },
    () => template(event, row),
  );
  const draft: AdvisoryDraft = { event, en: res.data.en, hi: res.data.hi, by: res.source === "none" ? "template" : (res.model ?? res.source), reach };
  if (res.source === "meta" || res.source === "baseten") drafts.set(key, { at: Date.now(), draft });
  return { draft, degraded: res.source === "none" ? "AI drafting unavailable — showing a template" : undefined };
}

export type PublishResult = { ok: true; sent: number } | { ok: false; status: number; error: string };

export async function publishAdvisory(official: Official, eventId: string, en: string, hi: string): Promise<PublishResult> {
  const loaded = await loadEvent(official, eventId);
  if (!loaded) return { ok: false, status: 404, error: "Event not found in your district (or already cleared)." };
  const { row } = loaded;

  // Guard against double taps / spam: one advisory per event per 10 minutes.
  const since = new Date(Date.now() - REPUBLISH_MIN * 60_000).toISOString();
  const recent = await select<{ id: string }>("event_timeline", `select=id&event_id=eq.${row.id}&data->>advisory=eq.true&at=gte.${since}&limit=1`);
  if (recent.length) return { ok: false, status: 409, error: `An advisory for this spot was published in the last ${REPUBLISH_MIN} minutes.` };

  const title = eventTitle(row.type, row.place_name);
  const w = await watchers(row);
  if (w.userIds.length) {
    await insert(
      "alerts",
      w.userIds.map((uid) => ({
        user_id: uid,
        kind: "info",
        title: `Advisory · ${official.org}`,
        body: en,
        data: { eventId: row.id, url: `/event/${row.id}`, hi, by: official.org, advisory: true, trip: title },
        is_demo: official.isDemo,
      })),
    );
  }
  await insert("event_timeline", {
    event_id: row.id,
    at: new Date().toISOString(),
    kind: "official",
    text: `Public advisory: ${en}`,
    actor: official.org,
    data: { advisory: true, hi, sent: w.userIds.length, by: official.userId },
    is_demo: official.isDemo,
  });
  // TODO(phase-5): also trigger the Muse Image share card for this advisory (/share/[eventId]).
  return { ok: true, sent: w.userIds.length };
}
