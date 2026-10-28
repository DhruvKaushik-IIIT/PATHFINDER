// Server-only: "Approve plan" — move the crews and write it on each event's timeline (what travellers
// see on the event page). The client sends the steps it showed; everything is re-checked here against
// the official's own district, so a forged request can't move another district's crews.
import { insert, update } from "../db/supabase.ts";
import type { Official } from "./auth.ts";
import { crewsOf, rankedQueue } from "./queue.ts";
import type { DispatchAction } from "./types.ts";

export interface ApproveStep {
  crewId: string;
  eventId: string;
  action: DispatchAction;
  text: string;
}

export async function approveDispatch(official: Official, steps: ApproveStep[]): Promise<{ moved: number; scheduled: number; skipped: number }> {
  const crews = await crewsOf(official.district);
  const queue = await rankedQueue(official.district, crews);
  let moved = 0;
  let scheduled = 0;
  let skipped = 0;
  const timeline: object[] = [];

  for (const s of steps) {
    const crew = crews.find((c) => c.id === s.crewId);
    const q = queue.find((x) => x.event.id === s.eventId);
    if (!crew || !q || s.action === "keep") {
      skipped += s.action === "keep" ? 0 : 1;
      continue;
    }
    const machines = crew.machines.length ? ` (${crew.machines.join(", ")})` : "";
    if (s.action === "send") {
      await update("crews", `id=eq.${crew.id}`, { current_event_id: q.event.id, available: false });
      crew.currentEventId = q.event.id;
      moved++;
      timeline.push({ text: `${crew.name}${machines} dispatched — on the way.`, eventId: q.event.id, crewId: crew.id });
    } else {
      scheduled++;
      timeline.push({ text: `${crew.name}${machines} scheduled: ${s.text.slice(0, 200)}`, eventId: q.event.id, crewId: crew.id });
    }
  }

  if (timeline.length) {
    await insert(
      "event_timeline",
      (timeline as { text: string; eventId: string; crewId: string }[]).map((t) => ({
        event_id: t.eventId,
        at: new Date().toISOString(),
        kind: "official",
        text: t.text,
        actor: official.org,
        data: { dispatch: true, crewId: t.crewId, by: official.userId },
        is_demo: official.isDemo,
      })),
    );
  }
  return { moved, scheduled, skipped };
}
