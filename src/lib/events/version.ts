// Server-only: the "data version" (Nov 1 sync fix). It changes the moment road data changes anywhere:
// an event confirmed/updated (reports, field updates, news merges all bump last_confirmed_at), an event
// resolved, a crew sent / arriving / done, a field update posted, or any timeline row (votes, passes, AI checks). Screens put it in their data URLs
// (`&v=…`), so the CDN and in-memory caches keep answers only while nothing has changed — fast AND in sync.
import { select } from "../db/supabase.ts";

const TTL_MS = 1500;
let memo: { at: number; v: string } | null = null;
let inflight: Promise<string> | null = null;

async function newest(table: string, col: string): Promise<number> {
  const rows = await select<Record<string, string | null>>(table, `select=${col}&${col}=not.is.null&order=${col}.desc&limit=1`).catch(() => []);
  const t = rows[0]?.[col];
  return t ? new Date(t).getTime() : 0;
}

export async function dataVersion(): Promise<string> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.v;
  inflight ??= Promise.all([
    newest("events", "last_confirmed_at"),
    newest("events", "resolved_at"),
    newest("official_updates", "created_at"),
    newest("crews", "dispatched_at"),
    newest("crews", "arrived_at"),
    newest("crews", "done_at"),
    newest("crews", "acknowledged_at"),
    // Every vote, Drive Watch pass, news merge and AI check adds a timeline row → caches refresh at once.
    newest("event_timeline", "at"),
  ])
    .then((ts) => {
      const v = Math.max(...ts).toString(36);
      memo = { at: Date.now(), v };
      return v;
    })
    .finally(() => (inflight = null));
  return inflight;
}

/**
 * Cache-Control for road data: with `?v=` in the URL the answer may sit in Vercel's edge cache (the URL
 * changes as soon as the data does); without it, never cache (old clients, scripts).
 */
export function liveCache(req: Request, sMaxAge = 300): HeadersInit {
  return new URL(req.url).searchParams.has("v")
    ? { "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=30` }
    : { "Cache-Control": "no-store" };
}
