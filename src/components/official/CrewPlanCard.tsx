"use client";

// Command Centre crew card (Option B Part C), replacing the placeholder-crew dispatch plan:
// CREWS AT WORK — each crew's progress (sent → opened → on site → % cleared), and
// NEEDS A CREW — the top unstaffed sites with what they need + "Build crew" (→ /official/crew/[id]).
// Advisory (14b) stays here for the top site. Plain code; no AI on this card.
import { ChevronRight, HardHat, Megaphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CrewBoardItem, ToStaffItem } from "@/lib/crew/builder";
import { ago, STATUS_STYLE } from "@/lib/events/types";

type Board = { active: CrewBoardItem[]; toStaff: ToStaffItem[]; onDutyFree: number };

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => IST.format(new Date(iso)).replace(/\s?(am|pm)/i, (m) => ` ${m.trim().toUpperCase()}`);

/** Where the crew is in its job, as one short line + a step index for the dots. */
function stage(c: CrewBoardItem): { text: string; step: number } {
  if (c.pct != null && c.lastUpdateAt) return { text: `${c.pct}% cleared · ${ago(c.lastUpdateAt)}`, step: 3 };
  if (c.arrivedAt) return { text: `On site since ${clock(c.arrivedAt)}`, step: 2 };
  if (c.acknowledgedAt) return { text: `Opened the job ${ago(c.acknowledgedAt)} · on the way`, step: 1 };
  if (c.dispatchedAt) return { text: `Sent ${clock(c.dispatchedAt)} · not opened yet`, step: 0 };
  return { text: "Working", step: 2 };
}
const STEPS = ["Sent", "Opened", "On site", "Clearing"];

export default function CrewPlanCard({ version, advisoryEventId, onMessage }: { version: number; advisoryEventId: string | null; onMessage: (m: string) => void }) {
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/official/crews")
        .then((r) => r.json() as Promise<{ data: Board | null; degraded?: string }>)
        .then((b) => {
          if (!alive) return;
          setBoard(b.data);
          if (b.degraded) onMessage(b.degraded);
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, 30_000); // crews move on their own — keep the board live
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [version, onMessage]);

  return (
    <section aria-label="Crews" className="flex flex-col gap-3 rounded-[16px] bg-white/[0.86] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.4px] text-ink-2">
          <HardHat size={15} strokeWidth={2.2} className="text-accent" aria-hidden />
          Crews
        </span>
        {board && <span className="text-[12px] text-ink-2">{board.onDutyFree} workers free on duty</span>}
      </div>

      {!board ? (
        <span className="h-[96px] animate-pulse rounded-[12px] bg-black/5" aria-busy />
      ) : (
        <>
          {board.active.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">At work</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {board.active.map((c) => {
                  const s = stage(c);
                  return (
                    <li key={c.id} className="flex flex-col gap-1.5 rounded-[12px] bg-black/[0.035] px-3 py-2.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-bold">{c.name}</span>
                        <span className="truncate text-[12px] text-ink-2">{c.eventTitle}</span>
                      </span>
                      <span className="text-[13px] text-ink-2">
                        {c.people} people{c.machines.length ? ` · ${c.machines.join(", ")}` : ""}
                      </span>
                      <span className="flex items-center gap-1.5" aria-label={`Progress: ${STEPS[s.step]}`}>
                        {STEPS.map((label, i) => (
                          <span key={label} className={`h-[5px] flex-1 rounded-full ${i <= s.step ? "bg-open" : "bg-black/10"}`} title={label} />
                        ))}
                      </span>
                      <span className="text-[12px] font-semibold text-open-ink">{s.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {board.toStaff.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Needs a crew · ranked by impact</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {board.toStaff.map((t) => {
                  const st = STATUS_STYLE[t.status];
                  return (
                    <li key={t.eventId}>
                      <Link href={`/official/crew/${t.eventId}`} className="flex items-center gap-3 rounded-[12px] bg-accent-tint px-3 py-2.5 text-ink no-underline">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: st.dot }} aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-semibold">{t.title}</span>
                          <span className="truncate text-[12px] text-ink-2">
                            {[t.road, t.needs.machines || "no machines", `${t.needs.people} people`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-[14px] font-semibold text-accent-tint-ink">Build crew</span>
                        <ChevronRight size={16} className="shrink-0 text-accent-tint-ink" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <span className="text-[14px] text-ink-2">Every open site has a crew.</span>
          )}
        </>
      )}

      {advisoryEventId && (
        <Link
          href={`/official/advisory/${advisoryEventId}`}
          className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-accent-tint text-[15px] font-semibold text-accent-tint-ink no-underline"
        >
          <Megaphone size={16} strokeWidth={2.2} aria-hidden />
          Public advisory for the top site
        </Link>
      )}
    </section>
  );
}
