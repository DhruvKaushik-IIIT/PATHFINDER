// Server-only: safe read-modify-write of one event row when many writers hit it at once
// (votes, Drive Watch passes, photo reports, news, AI checks, field updates).
// Optimistic locking on `events.rev` (bumped by a trigger, migration 0005): read the row, compute the
// patch from THAT row, update only if `rev` is unchanged, else re-read and retry. Before migration 0005
// is applied it falls back to a plain update (old behaviour) and says so once in the logs.
import { DbError, insertIfAbsent, select, update } from "../db/supabase.ts";

let revOk: boolean | null = null;
let votesOk: boolean | null = null;
const missing = (err: unknown, what: string) =>
  err instanceof DbError && (err.status === 400 || err.status === 404) && new RegExp(what).test(err.message);
const warned = new Set<string>();
const warnOnce = (what: string) => {
  if (warned.has(what)) return;
  warned.add(what);
  console.warn(JSON.stringify({ level: "warn", event: "migration_0005_missing", detail: `${what} — run supabase/migrations/0005_event_votes.sql` }));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Re-reads the event (`cols`, plus rev) and applies `fn(row)` atomically. `fn` must be pure: it may run
 * several times. Returns the row it was applied to and its patch, or null when the event is gone
 * (or resolved, with `openOnly`). `fn` returning null = nothing to write.
 */
export async function mutateEvent<R extends object>(
  id: string,
  cols: string,
  fn: (row: R) => Record<string, unknown> | null,
  opts: { openOnly?: boolean; tries?: number } = {},
): Promise<{ row: R; patch: Record<string, unknown> | null } | null> {
  const where = `id=eq.${id}${opts.openOnly ? "&resolved_at=is.null" : ""}&limit=1`;
  const tries = opts.tries ?? 12;
  for (let i = 0; i < tries; i++) {
    let row: (R & { rev?: number }) | undefined;
    if (revOk !== false) {
      try {
        [row] = await select<R & { rev: number }>("events", `select=${cols},rev&${where}`);
        revOk = true;
      } catch (err) {
        if (!missing(err, "rev")) throw err;
        revOk = false;
        warnOnce("events.rev missing, concurrent writes may overwrite each other");
      }
    }
    if (revOk === false) [row] = await select<R>("events", `select=${cols}&${where}`);
    if (!row) return null;
    const patch = fn(row);
    if (!patch) return { row, patch: null };
    if (revOk === false) {
      await update("events", `id=eq.${id}`, patch);
      return { row, patch };
    }
    const done = await update("events", `id=eq.${id}&rev=eq.${row.rev}`, patch);
    if (done.length) return { row, patch };
    await sleep(5 + Math.random() * 40 * (i + 1)); // someone else wrote first: back off, re-read, retry
  }
  throw new DbError(`event ${id}: too many concurrent writes, gave up after ${tries} tries`);
}

/**
 * Claim this phone's single vote of `kind` on the event for the current 6-hour window. Atomic: of N
 * simultaneous taps from one phone exactly one gets true. Before migration 0005: always true.
 */
export async function claimVote(eventId: string, device: string, kind: "tap" | "pass", isDemo = false): Promise<boolean> {
  if (votesOk === false) return true;
  try {
    const bucket = Math.floor(Date.now() / (6 * 3_600_000));
    const won = await insertIfAbsent("event_votes", { event_id: eventId, device, kind, bucket, is_demo: isDemo });
    votesOk = true;
    return won;
  } catch (err) {
    if (!missing(err, "event_votes")) throw err;
    votesOk = false;
    warnOnce("event_votes table missing, double taps are only checked loosely");
    return true;
  }
}

/** +1 photo report on the event (used by the Verifier and the concurrency test). Returns the new count. */
export async function bumpReports(id: string): Promise<number> {
  const r = await mutateEvent<{ sources: Record<string, number> | null }>(id, "sources", (row) => ({
    sources: { ...row.sources, reports: (row.sources?.reports ?? 0) + 1 },
  }));
  return Number((r?.patch?.sources as { reports?: number } | undefined)?.reports ?? 0);
}
