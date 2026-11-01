// Server-only: auto-close events past their shelf life (docs/event-lifecycle.md). Plain code, no AI.
// Runs in the daily cron AND lazily on reads (at most every 10 min per server instance), because
// Vercel Hobby crons are daily and a traffic jam only lives 6 hours.
import { after } from "next/server.js";
import { insert, select, update } from "../db/supabase.ts";
import { lifecycleOf } from "./lifecycle.ts";

interface Row {
  id: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  last_confirmed_at: string;
  sources: { reports?: number; official?: number; news?: number } | null;
  eta_clear: { earliest: string; latest: string } | null;
  measurements: { potholeSize?: string | null } | null;
}

/** Close these events (resolved_at = now) with a timeline line saying why. */
export async function closeExpired(list: { id: string; reason: string | null }[]): Promise<number> {
  let n = 0;
  for (const { id, reason } of list) {
    // `resolved_at=is.null` makes this idempotent when two instances sweep at once.
    const done = await update<{ id: string }>("events", `id=eq.${id}&resolved_at=is.null`, { resolved_at: new Date().toISOString() });
    if (!done.length) continue;
    n++;
    await insert("event_timeline", {
      event_id: id,
      kind: "report",
      text: `${reason ?? "No new reports"}.`,
      actor: "Pathfinder (automatic)",
      data: { auto: "expired" },
    }).catch(() => {});
  }
  return n;
}

export interface SweepResult {
  checked: number;
  closed: { id: string; reason: string | null }[];
  keptForCrew: number;
}

/** Find open real (non-demo) events past their shelf life and close them. Events with a crew working
 *  on them are never auto-closed (an official is handling it; they show as Unconfirmed instead). */
export async function sweepExpired(): Promise<SweepResult> {
  const rows = await select<Row>(
    "events",
    "select=id,type,status,lat,lng,last_confirmed_at,sources,eta_clear,measurements&resolved_at=is.null&is_demo=is.false&order=last_confirmed_at.asc&limit=1000",
  );
  const expired = rows
    .map((r) => ({
      r,
      life: lifecycleOf({
        type: r.type, status: r.status, lastConfirmedAt: r.last_confirmed_at, reports: r.sources?.reports,
        official: r.sources?.official, news: r.sources?.news, etaClear: r.eta_clear, potholeSize: r.measurements?.potholeSize,
      }),
    }))
    .filter((x) => x.life.state === "expired");
  if (!expired.length) return { checked: rows.length, closed: [], keptForCrew: 0 };

  const crewed = new Set(
    (
      await select<{ current_event_id: string }>(
        "crews",
        `select=current_event_id&current_event_id=in.(${expired.map((x) => x.r.id).join(",")})`,
      ).catch(() => [])
    ).map((c) => c.current_event_id),
  );
  const toClose = expired.filter((x) => !crewed.has(x.r.id));
  const closedN = await closeExpired(toClose.map((x) => ({ id: x.r.id, reason: x.life.reason })));
  if (closedN) {
    // Road Watch: a trip through a removed event changed. Dynamic import avoids a module cycle (roadWatch → planner → queries → here).
    const { roadWatchAfterChange } = await import("../watch/roadWatch.ts");
    await roadWatchAfterChange(toClose.map((x) => ({ lat: x.r.lat, lng: x.r.lng }))).catch(() => {});
  }
  return { checked: rows.length, closed: toClose.map((x) => ({ id: x.r.id, reason: x.life.reason })), keptForCrew: expired.length - toClose.length };
}

const LAZY_EVERY_MS = 10 * 60_000;
let lastLazy = 0;

/** Called from read paths: kick a sweep at most every 10 min, after the response is sent. */
export function maybeSweepExpired(): void {
  if (Date.now() - lastLazy < LAZY_EVERY_MS) return;
  lastLazy = Date.now();
  const run = () =>
    sweepExpired()
      .then((r) => {
        if (r.closed.length) console.log(JSON.stringify({ level: "info", event: "events_expired", closed: r.closed.length, keptForCrew: r.keptForCrew }));
      })
      .catch(() => {});
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts)
  }
}
