// Server-only: Nearby (frame 08) — open events within a radius, ranked, plus a short summary.
// Ranking is plain code; only the summary uses AI (Baseten → Meta → template), and only when
// there is something to summarise. Cached 10 min per (area, radius, event versions).
import { nearbySummary } from "../ai/router.ts";
import type { NearbySummary } from "../ai/schemas.ts";
import { nearestPlace, distanceM } from "../geo/snap.ts";
import { openEventsInBbox } from "./queries.ts";
import { ago, TYPE_WORD, type EventStatus, type MapEvent, type NearbyItem, type NearbyResult } from "./types.ts";

export const RADII_KM = [5, 10, 25, 50] as const;

const SEVERITY: Record<EventStatus, number> = { closed: 1, one_lane: 0.7, slow: 0.5, unknown: 0.3, open: 0.15 };

/** Higher = more important to someone standing at the centre. */
function score(e: MapEvent, km: number, now: number): number {
  const ageH = Math.max(0, (now - new Date(e.lastConfirmedAt).getTime()) / 3_600_000);
  const proximity = 1 / (1 + km / 10); // 10 km away counts half as much as right here
  const freshness = Math.exp(-ageH / 24); // a day-old confirmation counts ~⅓
  return SEVERITY[e.status] * (0.4 + 0.6 * e.confidence) * proximity * (0.3 + 0.7 * freshness);
}

const AT = new Set(["landslide", "snow", "ice", "flood_water", "road_damage", "accident"]);
function title(e: MapEvent): string {
  const what = TYPE_WORD[e.type] ?? "Road issue";
  return e.placeName ? `${what} ${AT.has(e.type) ? "at" : "near"} ${e.placeName}` : what;
}

const IST_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" });
const ist = (d: Date) => IST_FMT.format(d).replace(/\s?(am|pm)\b/gi, (m) => ` ${m.trim().toUpperCase()}`);

function counts(items: NearbyItem[]): NearbyResult["counts"] {
  const c = { closed: 0, oneLane: 0, slow: 0, other: 0 };
  for (const i of items) {
    if (i.status === "closed") c.closed++;
    else if (i.status === "one_lane") c.oneLane++;
    else if (i.status === "slow") c.slow++;
    else c.other++;
  }
  return c;
}

/** No-AI summary: "Within 25 km of Mandi: 1 road closed, 2 slow." */
export function templateSummary(place: string, radiusKm: number, c: NearbyResult["counts"]): NearbySummary {
  const parts = [
    c.closed && `${c.closed} road${c.closed > 1 ? "s" : ""} closed`,
    c.oneLane && `${c.oneLane} one-lane`,
    c.slow && `${c.slow} slow`,
    c.other && `${c.other} other report${c.other > 1 ? "s" : ""}`,
  ].filter(Boolean);
  const partsHi = [
    c.closed && `${c.closed} सड़क बंद`,
    c.oneLane && `${c.oneLane} जगह एक लेन`,
    c.slow && `${c.slow} जगह धीमा ट्रैफ़िक`,
    c.other && `${c.other} अन्य रिपोर्ट`,
  ].filter(Boolean);
  if (!parts.length) {
    return {
      summary: `No verified road issues within ${radiusKm} km of ${place}. Verify locally before you go.`,
      summaryHi: `${place} के ${radiusKm} किमी के अंदर कोई पुष्ट सड़क समस्या नहीं। निकलने से पहले स्थानीय जानकारी ज़रूर लें।`,
    };
  }
  return {
    summary: `Within ${radiusKm} km of ${place}: ${parts.join(", ")}.`,
    summaryHi: `${place} के ${radiusKm} किमी के अंदर: ${partsHi.join(", ")}।`,
  };
}

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: NearbyResult }>();

/** Throws only on database errors (the API route degrades); the summary never throws. */
export async function nearby(
  lat: number,
  lng: number,
  radiusKm: number,
  opts: { name?: string | null; summary?: boolean } = {},
): Promise<NearbyResult> {
  const name = opts.name;
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const [events, placeName] = await Promise.all([
    openEventsInBbox(lng - dLng, lat - dLat, lng + dLng, lat + dLat),
    name ? Promise.resolve(name) : nearestPlace(lat, lng, 0.15).catch(() => null),
  ]);
  const place = placeName ?? "you";
  const now = Date.now();
  const items: NearbyItem[] = events
    .map((e) => {
      const km = distanceM(lat, lng, e.lat, e.lng) / 1000;
      return { ...e, distanceKm: Math.round(km * 10) / 10, score: score(e, km, now) };
    })
    .filter((e) => e.distanceKm <= radiusKm)
    .sort((a, b) => b.score - a.score);
  const c = counts(items);
  const template = () => templateSummary(place, radiusKm, c);

  const key = [lat.toFixed(2), lng.toFixed(2), radiusKm, ...items.map((i) => `${i.id}:${i.status}:${i.lastConfirmedAt}`)].join("|");
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  // Nothing to summarise → no AI call (same rule as zero-event routes, 7.5b).
  let summary = template();
  let by = "code";
  if (items.length && opts.summary !== false) {
    const r = await nearbySummary(
      {
        placeName: place,
        radiusKm,
        now: ist(new Date(now)),
        events: items.slice(0, 8).map((e) => ({
          title: title(e),
          status: e.status,
          road: e.roadRef,
          distanceKm: Math.round(e.distanceKm),
          ago: ago(e.lastConfirmedAt, now),
          clears: e.etaClear ? `${ist(new Date(e.etaClear.earliest))}–${ist(new Date(e.etaClear.latest))}` : null,
          confidence: e.confidence,
        })),
      },
      template,
    );
    summary = r.data;
    by = r.source === "none" ? "code" : r.source;
  }

  const data: NearbyResult = {
    center: { lat, lng, name: place },
    radiusKm,
    counts: c,
    items,
    summary: summary.summary,
    summaryHi: summary.summaryHi || null,
    summaryBy: by,
  };
  // Only cache real AI answers (or the no-event template), so a provider blip retries next time.
  if (opts.summary !== false && (by !== "code" || !items.length)) {
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: now, data });
  }
  return data;
}
