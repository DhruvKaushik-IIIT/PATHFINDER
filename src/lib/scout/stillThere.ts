// Server-only: "Still there?" alerts (docs/event-lifecycle.md §2) — the pull path on a scout's location ping.
// Same rules as Scout requests: opted-in, location on and fresh, at most 2 asks a day (shared with photo
// requests), never while moving: ≤20 km/h for a one-tap answer (photo requests stay at ≤10 km/h).
// Unconfirmed events are asked about first. Plain code, no AI.
import { insert, select } from "../db/supabase.ts";
import { lifecycleOf, type Taps } from "../events/lifecycle.ts";
import { eventTitle, STATUS_STYLE, type EventStatus } from "../events/types.ts";
import { kmBetween } from "../official/districts.ts";
import { MAX_PER_DAY, sentToday } from "./requests.ts";

const NEAR_KM = 2.5; // coarse location is rounded to ~1 km; the answer itself is checked at ≤2 km
const MAX_KMH = 20;

interface Row {
  id: string;
  type: string;
  status: EventStatus;
  place_name: string | null;
  lat: number;
  lng: number;
  last_confirmed_at: string;
  sources: { reports?: number; official?: number; news?: number; taps?: Taps } | null;
  eta_clear: { earliest: string; latest: string } | null;
  measurements: { potholeSize?: string | null } | null;
  is_demo: boolean | null;
}

const ago = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
};

/** At most one ask per ping. Returns the event id asked about, or null. */
export async function askStillThereForUser(user: { id: string; coarse_lat: number; coarse_lng: number; speed_kmh: number | null }): Promise<string | null> {
  if (user.speed_kmh != null && user.speed_kmh > MAX_KMH) return null;
  if ((await sentToday(user.id)) >= MAX_PER_DAY) return null;
  const me = { lat: user.coarse_lat, lng: user.coarse_lng };
  const d = NEAR_KM / 111;
  const dl = NEAR_KM / (111 * Math.cos((me.lat * Math.PI) / 180));
  const [rows, [u], asked] = await Promise.all([
    select<Row>(
      "events",
      "select=id,type,status,place_name,lat,lng,last_confirmed_at,sources,eta_clear,measurements,is_demo&resolved_at=is.null&status=neq.open&type=neq.clear" +
        `&lat=gte.${me.lat - d}&lat=lte.${me.lat + d}&lng=gte.${me.lng - dl}&lng=lte.${me.lng + dl}&limit=50`,
    ),
    select<{ is_demo: boolean | null }>("users", `select=is_demo&id=eq.${user.id}&limit=1`),
    // Never ask the same person twice about the same event.
    select<{ data: { eventId?: string } }>("alerts", `select=data&user_id=eq.${user.id}&data->>stillThere=eq.true&limit=200`),
  ]);
  const done = new Set(asked.map((a) => a.data.eventId));
  const pick = rows
    .filter((r) => !done.has(r.id) && (!r.is_demo || u?.is_demo) && kmBetween(me, r) <= NEAR_KM)
    .map((r) => ({
      r,
      life: lifecycleOf({
        type: r.type, status: r.status, lastConfirmedAt: r.last_confirmed_at, reports: r.sources?.reports, official: r.sources?.official,
        news: r.sources?.news, isDemo: r.is_demo, placed: Boolean((r.sources as { placed?: boolean } | null)?.placed), etaClear: r.eta_clear, potholeSize: r.measurements?.potholeSize, taps: r.sources?.taps,
      }),
    }))
    // Unconfirmed first, then active ones at least a quarter into their shelf life (fresh ones don't need asking).
    .filter(({ r, life }) => {
      if (life.state === "unconfirmed") return true;
      if (life.state !== "active" || !life.shelfLifeH) return false;
      return Date.now() - new Date(r.last_confirmed_at).getTime() >= (life.shelfLifeH / 4) * 3_600_000;
    })
    .sort((a, b) => Number(b.life.state === "unconfirmed") - Number(a.life.state === "unconfirmed") || kmBetween(me, a.r) - kmBetween(me, b.r))[0];
  if (!pick) return null;
  const { r } = pick;
  const word = (STATUS_STYLE[r.status] ?? STATUS_STYLE.unknown).word.toLowerCase();
  const title = eventTitle(r.type, r.place_name);
  await insert("alerts", {
    user_id: user.id,
    kind: "scout_request",
    title: "Still there?",
    body: `${title} was reported ${word} ${ago(r.last_confirmed_at)} ago, and you're close by. One tap tells travellers if it's still there. Only when safely stopped.`,
    data: { stillThere: true, eventId: r.id, title, type: r.type, status: r.status, placeName: r.place_name, lat: r.lat, lng: r.lng, url: `/event/${r.id}` },
  });
  return r.id;
}
