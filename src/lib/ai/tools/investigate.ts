// Server-only: tools for the Investigator agent (CLAUDE.md 6.4). Plain code over the event's claims,
// official updates, the reopening predictor and Open-Meteo; one grounded web search per run.
import type OpenAI from "openai";
import { z } from "zod";
import { insert, select, update } from "../../db/supabase.ts";
import { reopeningFor } from "../../events/reopening.ts";
import { weatherAt } from "../../weather.ts";
import { Investigation } from "../schemas.ts";
import { ist } from "./routeCheck.ts";

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

export interface InvestigatedEvent {
  id: string;
  segment_id: string | null;
  type: string;
  status: string;
  place_name: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  confidence: number;
  started_at: string;
  last_confirmed_at: string;
  eta_clear: { earliest: string; latest: string } | null;
  measurements: Record<string, unknown> | null;
  sources: { reports?: number; official?: number; news?: number; notices?: number } | null;
  is_demo?: boolean;
  road_segments?: { road_ref: string | null; road_name: string | null } | null;
}

export interface SearchHit {
  text: string;
  sources: { url: string; title: string | null }[];
}

export interface InvestigateContext {
  event: InvestigatedEvent;
  /** Grounded web search (router job), injected so this file doesn't import the router. */
  search: (query: string) => Promise<SearchHit | null>;
  searchesLeft: number;
  /** Set when the agent asked for a scout photo (the request row id). */
  scoutRequestId: string | null;
  /** URLs the search actually returned — evidence lines may only cite these. */
  citedUrls: Set<string>;
}

const fn = (name: string, description: string, parameters: Record<string, unknown>): Tool => ({
  type: "function",
  function: { name, description, parameters },
});
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: "object", properties: props, required, additionalProperties: false });
const submitSchema = (() => {
  const s = { ...(z.toJSONSchema(Investigation) as Record<string, unknown>) };
  delete s.$schema;
  return s;
})();

export const INVESTIGATE_TOOLS: Tool[] = [
  fn("get_event", "The event as shown on the map: type, status, place, road, confidence, sources, clearing window, when it started and was last confirmed.", obj({}, [])),
  fn("get_claims", "Traveller reports on this event, newest first: what the AI read from each photo/voice note, the verifier's verdict, and when.", obj({}, [])),
  fn("get_official_updates", "Road-department field updates: % cleared, status, expected full opening, machines, and whether the photo matched (AI check).", obj({}, [])),
  fn("get_reopening_estimate", "Code's reopening predictor: from the photo sequence or debris volume ÷ machine rate. Says if it should be clear by now.", obj({}, [])),
  fn(
    "get_weather",
    "Open-Meteo forecast at a point: rain/snow now and over the next 6 hours.",
    obj({ lat: { type: "number" }, lng: { type: "number" }, at: { type: "string", description: "ISO date-time (IST)" } }, ["lat", "lng", "at"]),
  ),
  fn(
    "search_news",
    "Live web search (news) — ONE call per investigation, only when reports are old or the event is news-only. Returns a short digest with sources.",
    obj({ query: { type: "string", description: 'e.g. "Kataula landslide MDR-23 Mandi road"' } }, ["query"]),
  ),
  fn(
    "request_scout_photo",
    "Ask opted-in travellers stopped near the spot for a fresh photo. Use when a photo would settle the doubt.",
    obj({ question: { type: "string", description: 'one short question, e.g. "Is one lane open at Kataula now?"' } }, ["question"]),
  ),
  fn("submit_findings", "Submit your findings. Call exactly once, at the end.", submitSchema),
];

const hAgo = (iso: string) => Math.round(((Date.now() - new Date(iso).getTime()) / 3_600_000) * 10) / 10;

/** Runs one tool call. Never throws: errors come back as text the model can recover from. */
export async function runInvestigateTool(ctx: InvestigateContext, name: string, rawArgs: string): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { error: "arguments were not valid JSON" };
  }
  const ev = ctx.event;
  try {
    switch (name) {
      case "get_event":
        return {
          eventId: ev.id,
          type: ev.type,
          status: ev.status,
          place: ev.place_name,
          road: ev.road_segments?.road_ref ?? ev.road_segments?.road_name ?? null,
          lat: ev.lat,
          lng: ev.lng,
          summary: ev.summary,
          confidence: ev.confidence,
          sources: { reports: 0, official: 0, news: 0, notices: 0, ...ev.sources },
          startedAt: ist(ev.started_at),
          lastConfirmedAt: ist(ev.last_confirmed_at),
          lastConfirmedHoursAgo: hAgo(ev.last_confirmed_at),
          clearingWindow: ev.eta_clear ? { earliest: ist(ev.eta_clear.earliest), latest: ist(ev.eta_clear.latest) } : null,
          clearingWindowPassed: ev.eta_clear ? Date.now() > new Date(ev.eta_clear.latest).getTime() : null,
        };
      case "get_claims": {
        const rows = await select<{ payload: Record<string, unknown>; created_at: string; reports: { status: string; transcript: string | null } | null }>(
          "claims",
          `select=payload,created_at,reports!inner(status,transcript,event_id)&reports.event_id=eq.${ev.id}&order=created_at.desc&limit=8`,
        );
        const timeline = await select<{ at: string; kind: string; text: string; actor: string | null }>(
          "event_timeline",
          `select=at,kind,text,actor&event_id=eq.${ev.id}&kind=in.(report,news,notice)&order=at.desc&limit=10`,
        );
        return {
          claims: rows.map((r) => ({
            at: ist(r.created_at),
            hoursAgo: hAgo(r.created_at),
            verdict: r.reports?.status ?? null,
            eventType: r.payload.eventType,
            status: r.payload.status,
            summary: r.payload.summary,
            confidence: r.payload.confidence,
            voiceNote: r.reports?.transcript ? r.reports.transcript.slice(0, 300) : null,
          })),
          // Seeded / news / older evidence lives on the timeline only.
          timeline: timeline.map((t) => ({ at: ist(t.at), hoursAgo: hAgo(t.at), kind: t.kind, actor: t.actor, text: t.text.slice(0, 300) })),
        };
      }
      case "get_official_updates": {
        const rows = await select<{ created_at: string; status: string; pct_cleared: number | null; eta_full_open: string | null; machines: string[] | null; ai_check: { level?: string; text?: string; org?: string } | null }>(
          "official_updates",
          `select=created_at,status,pct_cleared,eta_full_open,machines,ai_check&event_id=eq.${ev.id}&order=created_at.desc&limit=5`,
        );
        const timeline = await select<{ at: string; text: string; actor: string | null }>(
          "event_timeline",
          `select=at,text,actor&event_id=eq.${ev.id}&kind=eq.official&order=at.desc&limit=5`,
        );
        return {
          updates: rows.map((u) => ({
            at: ist(u.created_at),
            hoursAgo: hAgo(u.created_at),
            org: u.ai_check?.org ?? null,
            status: u.status,
            pctCleared: u.pct_cleared,
            fullyOpenBy: u.eta_full_open ? ist(u.eta_full_open) : null,
            machines: u.machines,
            photoCheck: u.ai_check?.level ?? null,
            photoCheckText: u.ai_check?.text ?? null,
          })),
          officialTimeline: timeline.map((t) => ({ at: ist(t.at), hoursAgo: hAgo(t.at), actor: t.actor, text: t.text.slice(0, 300) })),
        };
      }
      case "get_reopening_estimate": {
        const r = await reopeningFor(ev);
        return {
          method: r.method,
          basis: r.basis,
          stalled: r.stalled ?? false,
          oneLane: r.oneLane ? { earliest: ist(r.oneLane.earliest), latest: ist(r.oneLane.latest) } : null,
          fullyOpen: r.fullyOpen ? { earliest: ist(r.fullyOpen.earliest), latest: ist(r.fullyOpen.latest) } : null,
          debrisVolumeM3: r.debrisVolumeM3,
          machinesOnSite: r.machines,
        };
      }
      case "get_weather": {
        const lat = Number(args.lat);
        const lng = Number(args.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "lat and lng must be numbers" };
        return await weatherAt(lat, lng, String(args.at ?? new Date().toISOString())).catch(() => ({ error: "weather unavailable right now — don't rely on weather" }));
      }
      case "search_news": {
        if (ctx.searchesLeft <= 0) return { error: "search budget used — decide with what you have" };
        ctx.searchesLeft--;
        const q = String(args.query ?? "").slice(0, 160);
        if (!q.trim()) return { error: "empty query" };
        const hit = await ctx.search(q);
        if (!hit) return { error: "search unavailable right now" };
        for (const s of hit.sources) ctx.citedUrls.add(s.url);
        return { digest: hit.text.slice(0, 4000), sources: hit.sources.slice(0, 8) };
      }
      case "request_scout_photo": {
        if (ctx.scoutRequestId) return { ok: true, note: "already requested" };
        if (!ev.segment_id) return { error: "this event isn't on a mapped road segment — a scout request can't be routed" };
        const question = String(args.question ?? "").slice(0, 160);
        if (!question.trim()) return { error: "empty question" };
        // One open request per segment: repeat asks raise its demand instead of a new row.
        const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
        const [open] = await select<{ id: string; demand_count: number }>(
          "scout_requests",
          `select=id,demand_count&segment_id=eq.${encodeURIComponent(ev.segment_id)}&fulfilled_by_report_id=is.null&created_at=gte.${since}&limit=1`,
        );
        if (open) {
          await update("scout_requests", `id=eq.${open.id}`, { demand_count: open.demand_count + 1 });
          ctx.scoutRequestId = open.id;
        } else {
          const [row] = await insert<{ id: string }>("scout_requests", { segment_id: ev.segment_id, question, demand_count: 1, is_demo: ev.is_demo ?? false });
          ctx.scoutRequestId = row!.id;
        }
        // TODO(phase-5B): send it to opted-in, stationary scouts nearby (alerts kind scout_request).
        return { ok: true, note: "request queued for nearby scouts" };
      }
      default:
        return { error: `unknown tool ${name}` };
    }
  } catch (err) {
    return { error: `tool failed: ${(err as Error).message.slice(0, 120)}` };
  }
}
