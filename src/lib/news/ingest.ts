// Server-only: news ingest (CLAUDE.md 6.1 INPUTS "news", Phase 3 cold-start fix).
// 1. Meta Spark + web_search → a cited digest of recent HP road news.
// 2. Baseten Spark Open → structured NewsItems (a second model reads the first one's digest).
// 3. Rules in code: cited URL only, published ≤ 72 h ago, place geocoded inside HP.
// 4. World state: confirm a nearby open event (sources.news +1, timeline "news") or create a
//    news-only event with capped confidence. News never closes or reopens an event on its own.
import { booleanPointInPolygon, lineString, nearestPointOnLine, point } from "@turf/turf";
import { parseRoadNews, searchRoadNews } from "../ai/router.ts";
import type { NewsItem } from "../ai/schemas.ts";
import { insert, rpc, select, update } from "../db/supabase.ts";
import { HP_BOUNDARY } from "../geo/hpBoundary.ts";
import { searchPlaces } from "../geo/places.ts";
import { snapToRoad } from "../geo/snap.ts";

const MAX_AGE_H = 72;
const MERGE_DEG = 0.02; // ~2 km: news names a village, not the exact spot
const NEWS_ONLY_MAX_CONF = 0.55; // "from news — not yet confirmed by travellers"

export type Outcome =
  | { action: "created" | "confirmed"; eventId: string; lat: number; lng: number }
  | { action: "skipped"; reason: string };

export interface IngestReport {
  ok: boolean;
  degraded?: string;
  searches: number;
  sources: number;
  parsed: number;
  results: { place: string; road: string | null; status: string; url: string; outcome: Outcome }[];
}

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const norm = (u: string) => u.trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "news";
  }
};

/** Rule-based checks (no AI): cited, recent, actionable. Returns a reason to skip, or null. */
export function ruleCheck(item: NewsItem, cited: Set<string>, now = Date.now()): string | null {
  if (!cited.has(norm(item.sourceUrl))) return "source not among the pages the search actually cited/opened";
  if (!item.publishedAt) return "no publication date";
  const t = Date.parse(item.publishedAt);
  if (Number.isNaN(t)) return "unreadable publication date";
  if (t > now + 3_600_000) return "publication date in the future";
  if (now - t > MAX_AGE_H * 3_600_000) return `older than ${MAX_AGE_H} h`;
  if (item.confidence < 0.3) return "too vague";
  return null;
}

/** Edit distance, for "Khalota" ≈ "Kharota" (Hindi place names have several spellings). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length]!;
}

/** Search engines match fuzzily; only accept a result that is really the same name. */
function sameName(asked: string, found: string): boolean {
  const a = asked.toLowerCase().replace(/[^a-z]/g, "");
  const b = found.toLowerCase().replace(/[^a-z]/g, "");
  if (a === b || (a.length >= 5 && (b.startsWith(a) || a.startsWith(b)))) return true;
  return Math.min(a.length, b.length) >= 6 && editDistance(a, b) <= 1;
}

/** Place name → coordinates inside Himachal (our places first, then Photon). */
async function locate(name: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const clean = name.replace(/\b(near|village|town|district|pass)\b/gi, " ").replace(/\s+/g, " ").trim();
  for (const q of [name, clean]) {
    const { places } = await searchPlaces(q);
    const hit = places.find((p) => sameName(q, p.name) && booleanPointInPolygon([p.lng, p.lat], HP_BOUNDARY));
    if (hit) return { lat: hit.lat, lng: hit.lng, name: hit.name };
  }
  return null;
}

interface SegmentRow {
  id: string;
  road_ref: string | null;
  geom: { type: "LineString"; coordinates: [number, number][] };
}

const refKey = (r: string | null | undefined) => (r ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * News names a village, the road runs nearby. Put the event ON the road the article names (so
 * route checks see it): nearest point of a segment with that ref within ~6 km; without a ref (or
 * no match), the nearest road segment within ~1.5 km; else stay at the village.
 */
export async function onNamedRoad(
  at: { lat: number; lng: number },
  roadRef: string | null,
): Promise<{ lat: number; lng: number; segmentId: string | null; roadRef: string | null }> {
  const d = 0.06;
  const segs = await rpc<SegmentRow[]>("segments_in_bbox", { w: at.lng - d, s: at.lat - d, e: at.lng + d, n: at.lat + d }).catch(
    () => [] as SegmentRow[],
  );
  const want = refKey(roadRef);
  type Hit = { lat: number; lng: number; km: number; seg: SegmentRow };
  let best: Hit | null = null;
  let bestNamed: Hit | null = null;
  for (const sg of segs) {
    if (sg.geom.coordinates.length < 2) continue;
    const p = nearestPointOnLine(lineString(sg.geom.coordinates), point([at.lng, at.lat]), { units: "kilometers" });
    const hit: Hit = { lng: p.geometry.coordinates[0]!, lat: p.geometry.coordinates[1]!, km: p.properties.dist ?? Infinity, seg: sg };
    if (!best || hit.km < best.km) best = hit;
    if (want && refKey(sg.road_ref) === want && (!bestNamed || hit.km < bestNamed.km)) bestNamed = hit;
  }
  const named = bestNamed as Hit | null; // TS narrows the loop-assigned lets to `null`
  const any = best as Hit | null;
  const pick = named && named.km <= 6 ? named : any && any.km <= 1.5 ? any : null;
  return pick
    ? { lat: pick.lat, lng: pick.lng, segmentId: pick.seg.id, roadRef: pick.seg.road_ref }
    : { lat: at.lat, lng: at.lng, segmentId: null, roadRef: null };
}

interface OpenEvent {
  id: string;
  confidence: number;
  last_confirmed_at: string;
  sources: { reports: number; official: number; news: number; notices: number };
}

async function apply(item: NewsItem, at: { lat: number; lng: number; name: string }, publishedAt: string, demo: boolean): Promise<Outcome> {
  const key = `${item.sourceUrl}#${slug(item.placeName)}`;
  const [seen] = await select<{ id: string }>("news_items", `select=id&url=eq.${encodeURIComponent(key)}&limit=1`);
  if (seen) return { action: "skipped", reason: "already ingested" };

  const road = await onNamedRoad(at, item.roadRef);
  const { lat, lng } = road;
  const segmentId = road.segmentId ?? (await snapToRoad(lat, lng)).segment?.id ?? null;
  const [claim] = await insert<{ id: string }>("claims", {
    source: "news",
    payload: item,
    confidence: item.confidence,
    is_demo: demo,
  });
  await insert("news_items", {
    url: key,
    title: item.sourceTitle,
    published_at: publishedAt,
    segment_id: segmentId,
    claim_id: claim!.id,
    is_demo: demo,
  });

  const [existing] = await select<OpenEvent>(
    "events",
    `select=id,confidence,last_confirmed_at,sources&resolved_at=is.null` +
      `&lat=gte.${lat - MERGE_DEG}&lat=lte.${lat + MERGE_DEG}&lng=gte.${lng - MERGE_DEG}&lng=lte.${lng + MERGE_DEG}` +
      `&order=last_confirmed_at.desc&limit=1`,
  );
  const source = host(item.sourceUrl);
  const timeline = (eventId: string, text: string) =>
    insert("event_timeline", {
      event_id: eventId,
      at: publishedAt,
      kind: "news",
      text,
      actor: source,
      data: { url: item.sourceUrl, title: item.sourceTitle, status: item.status, type: item.eventType, reopened: item.reopened, claimId: claim!.id },
      is_demo: demo,
    });

  if (existing) {
    const sources = { ...existing.sources, news: (existing.sources?.news ?? 0) + 1 };
    await update("events", `id=eq.${existing.id}`, {
      sources,
      // News is a weak, independent confirmation; it never moves the status (travellers/officials do).
      // News alone can't make an event look traveller-verified.
      confidence: Math.min(existing.sources?.reports || existing.sources?.official ? 0.97 : 0.65, 1 - (1 - existing.confidence) * (1 - 0.15 * item.confidence)),
      last_confirmed_at: publishedAt > existing.last_confirmed_at ? publishedAt : existing.last_confirmed_at,
    });
    await timeline(
      existing.id,
      item.reopened ? `News says reopened — awaiting a traveller or official confirmation: ${item.summary}` : `In the news: ${item.summary}`,
    );
    return { action: "confirmed", eventId: existing.id, lat, lng };
  }

  if (item.reopened || item.status === "open") return { action: "skipped", reason: "reopened, and no open event here to update" };
  if (item.status === "unknown") return { action: "skipped", reason: "status unclear" };

  const [ev] = await insert<{ id: string }>("events", {
    segment_id: segmentId,
    type: item.eventType,
    status: item.status,
    // The article's own spelling ("Khalota") is what readers search for; we only moved the pin onto the road.
    place_name: item.placeName,
    lat,
    lng,
    summary: item.summary,
    summary_hi: item.summaryHi,
    confidence: Math.min(NEWS_ONLY_MAX_CONF, 0.3 + 0.3 * item.confidence),
    started_at: publishedAt,
    last_confirmed_at: publishedAt,
    sources: { reports: 0, official: 0, news: 1, notices: 0 },
    is_demo: demo,
  });
  await timeline(ev!.id, `From the news: ${item.summary}`);
  return { action: "created", eventId: ev!.id, lat, lng };
}

/** Never throws for AI failures (returns ok:false + degraded); DB errors per item are caught too. */
export async function ingestNews(opts: { dryRun?: boolean; demo?: boolean } = {}): Promise<IngestReport> {
  const nowIst = IST.format(new Date());
  const search = await searchRoadNews(nowIst);
  if (!search.data) {
    console.warn("[news] search unavailable, skipping run:", search.degraded);
    return { ok: false, degraded: `news search unavailable: ${search.degraded ?? "unknown"}`, searches: 0, sources: 0, parsed: 0, results: [] };
  }
  const digest = search.data;
  const report: IngestReport = { ok: true, searches: digest.searches, sources: digest.sources.length, parsed: 0, results: [] };
  if (/no recent reports/i.test(digest.text) && digest.text.length < 200) return report;

  const parsed = await parseRoadNews({ nowIst, digest: digest.text, sources: digest.sources });
  if (!parsed.data) return { ...report, ok: false, degraded: `news parsing unavailable: ${parsed.degraded ?? "unknown"}` };
  report.parsed = parsed.data.items.length;

  const cited = new Set(digest.sources.map((s) => norm(s.url)));
  for (const item of parsed.data.items) {
    const row = { place: item.placeName, road: item.roadRef ?? item.roadName, status: item.reopened ? "reopened" : item.status, url: item.sourceUrl };
    const why = ruleCheck(item, cited);
    if (why) {
      report.results.push({ ...row, outcome: { action: "skipped", reason: why } });
      continue;
    }
    try {
      const at = await locate(item.placeName);
      if (!at) {
        report.results.push({ ...row, outcome: { action: "skipped", reason: "place not found inside Himachal" } });
        continue;
      }
      if (opts.dryRun) {
        report.results.push({ ...row, place: `${item.placeName} → ${at.name} (${at.lat.toFixed(3)}, ${at.lng.toFixed(3)})`, outcome: { action: "skipped", reason: "dry run (would apply)" } });
        continue;
      }
      const outcome = await apply(item, at, new Date(Date.parse(item.publishedAt!)).toISOString(), opts.demo ?? false);
      report.results.push({ ...row, outcome });
    } catch (err) {
      report.results.push({ ...row, outcome: { action: "skipped", reason: `error: ${(err as Error).message.slice(0, 120)}` } });
    }
  }
  return report;
}
