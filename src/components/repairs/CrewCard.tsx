// Frame 07 crew card: org · crew, "At work" pill, % cleared bar, Now / Fully open / Machines, last update
// + whether the AI photo check matched. Used on /route/repairs and the event page (frame 05).
import Link from "next/link";
import { STATUS_STYLE } from "@/lib/events/types";
import { clock } from "@/lib/geo/format";
import { machinesLabel, type Repair } from "@/lib/repairs/types";

const CHECK: Record<NonNullable<Repair["check"]>, string> = {
  ok: "photos match the update",
  warn: "photo didn't match the update — verify locally",
  unknown: "photo not checked",
};

export default function CrewCard({ r, link = true }: { r: Repair; link?: boolean }) {
  const pill = r.resolved
    ? { word: "Done", bg: "rgba(52,199,89,0.16)", ink: "#1A6B35", dot: "#1E7B45" }
    : r.atWork
      ? { word: "At work", bg: "rgba(52,199,89,0.16)", ink: "#1A6B35", dot: "#1E7B45" }
      : { word: "Assigned", bg: "rgba(142,142,147,0.16)", ink: "#48484A", dot: "#8E8E93" };
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[17px] font-bold">{r.title}</span>
          <span className="truncate text-[13px] text-ink-2">
            {r.org}
            {r.crewName ? ` · ${r.crewName}` : ""}
          </span>
        </span>
        <span
          className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full px-[9px] py-[5px] text-[12px] font-bold"
          style={{ background: pill.bg, color: pill.ink }}
        >
          <span className="size-[7px] rounded-full" style={{ background: pill.dot }} />
          {pill.word}
        </span>
      </div>
      {r.pctCleared !== null ? (
        <div className="flex flex-col gap-[6px]">
          <span className="flex justify-between text-[13px]">
            <span className="text-ink-2">Cleared</span>
            <span className="font-bold">{r.pctCleared}%</span>
          </span>
          <span
            className="h-[7px] overflow-hidden rounded-full bg-[rgba(118,118,128,0.18)]"
            role="progressbar"
            aria-valuenow={r.pctCleared}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Cleared"
          >
            <span className="block h-full rounded-full bg-accent" style={{ width: `${r.pctCleared}%` }} />
          </span>
        </div>
      ) : (
        <span className="text-[13px] text-ink-2">No progress report from the crew yet</span>
      )}
      <div className="grid grid-cols-3 gap-2">
        <span className="flex flex-col gap-px">
          <span className="text-[12px] text-ink-2">Now</span>
          <span className="text-[14px] font-semibold">{STATUS_STYLE[r.status].word}</span>
        </span>
        <span className="flex flex-col gap-px">
          <span className="text-[12px] text-ink-2">{r.resolved ? "Opened" : "Fully open"}</span>
          <span className="text-[14px] font-semibold">{r.fullyOpenAt ? `~${clock(r.fullyOpenAt)}` : "—"}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[12px] text-ink-2">Machines</span>
          <span className="truncate text-[14px] font-semibold">{machinesLabel(r.machines)}</span>
        </span>
      </div>
      <span className="text-[12px] text-ink-2">
        {r.lastUpdateAt ? `Last update ${clock(r.lastUpdateAt)}${r.check ? ` · ${CHECK[r.check]}` : ""}` : "Crew assigned · no field update yet"}
      </span>
    </>
  );
  const cls = "flex flex-col gap-3 rounded-[18px] bg-white/[0.84] p-4 text-ink no-underline";
  return link ? (
    <Link href={`/event/${r.eventId}`} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
