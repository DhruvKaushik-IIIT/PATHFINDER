"use client";

// AI Dispatch Plan card (frame 14): code plan instantly, then the Crew Dispatch agent's version
// (Muse Wonder, ~20 s, cached server-side). Vehicle-hours are always computed by code.
// Approve plan moves the crews; Advisory opens the public advisory for the top event (14b).
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { roughCount, type DispatchPlan } from "@/lib/official/types";

const BY: Record<DispatchPlan["by"], string> = {
  meta: "Muse Wonder agent",
  baseten: "Muse Spark Open agent",
  mock: "Demo plan",
  code: "Basic plan (code)",
};

/** Bold the crew name inside the step sentence (as in the design). */
function withCrew(text: string, crew: string) {
  const i = text.indexOf(crew);
  if (i < 0) return text;
  return (
    <Fragment>
      {text.slice(0, i)}
      <strong>{crew}</strong>
      {text.slice(i + crew.length)}
    </Fragment>
  );
}

export default function DispatchCard({
  version,
  advisoryEventId,
  onApproved,
  onMessage,
}: {
  /** Bump to refetch (after an approval). */
  version: number;
  advisoryEventId: string | null;
  onApproved: () => void;
  onMessage: (m: string) => void;
}) {
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [thinking, setThinking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [why, setWhy] = useState(false);

  useEffect(() => {
    let alive = true;
    setApproved(false);
    (async () => {
      type R = { ok: boolean; data: DispatchPlan | null; degraded?: string };
      try {
        const code = (await fetch("/api/official/dispatch").then((r) => r.json())) as R;
        if (!alive) return;
        setPlan(code.data);
        if (!code.data || !code.data.steps.some((s) => s.action !== "keep")) return;
        setThinking(true);
        const ai = (await fetch("/api/official/dispatch?ai=1").then((r) => r.json())) as R;
        if (!alive) return;
        if (ai.data) setPlan(ai.data);
        if (ai.degraded) onMessage(ai.degraded);
      } catch {
        if (alive) onMessage("Dispatch plan unavailable right now");
      } finally {
        if (alive) setThinking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [version, onMessage]);

  async function approve() {
    if (!plan) return;
    setApproving(true);
    try {
      const res = await fetch("/api/official/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: plan.steps.map(({ crewId, eventId, action, text }) => ({ crewId, eventId, action, text })) }),
      });
      const j = (await res.json()) as { ok: boolean; data?: { moved: number; scheduled: number }; error?: string };
      if (!j.ok || !j.data) throw new Error(j.error);
      setApproved(true);
      const { moved, scheduled } = j.data;
      onMessage(
        `Plan approved — ${moved} crew${moved === 1 ? "" : "s"} dispatched${scheduled ? `, ${scheduled} scheduled` : ""}. Shown on each event's timeline.`,
      );
      onApproved();
    } catch (err) {
      onMessage((err as Error).message || "Couldn't approve the plan — try again");
    }
    setApproving(false);
  }

  if (!plan) {
    return <span className="h-[180px] animate-pulse rounded-[16px] bg-white/70" aria-busy />;
  }
  const actionable = plan.steps.some((s) => s.action !== "keep");

  return (
    <section aria-label="AI dispatch plan" className="flex flex-col gap-3 rounded-[16px] bg-white/[0.86] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold tracking-[0.5px] text-ink-2">AI DISPATCH PLAN</span>
        <span className="flex items-center gap-1 text-[12px] text-ink-3">
          {thinking && <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden />}
          {thinking ? "Muse Wonder is checking…" : BY[plan.by]}
        </span>
      </div>

      {plan.steps.length === 0 ? (
        <p className="m-0 text-[15px] leading-[1.4]">No crew moves needed right now.</p>
      ) : (
        <>
          <span className="text-[16px] font-bold leading-snug">{plan.headline}</span>
          <ol className="m-0 flex flex-col gap-2 pl-5 text-[15px] leading-[1.4]">
            {plan.steps.map((s) => (
              <li key={`${s.crewId}-${s.eventId}`}>{withCrew(s.text, s.crewName)}</li>
            ))}
          </ol>
          {plan.savedVh > 0 && (
            <span className="text-[14px] font-semibold text-open-ink">
              Saves about {roughCount(plan.savedVh)} vehicle-hours vs. the current order (est.)
            </span>
          )}
        </>
      )}

      <button type="button" onClick={() => setWhy(!why)} aria-expanded={why} className="-my-1 h-8 self-start text-[14px] font-semibold text-link">
        {why ? "Hide why" : "Why this plan"}
      </button>
      {why && (
        <div className="flex flex-col gap-1 rounded-[12px] bg-[rgba(118,118,128,0.10)] px-3 py-[10px] text-[13px] leading-[1.45] text-ink-2">
          <span>{plan.reasoning}</span>
          {plan.headlineHi && <span lang="hi">{plan.headlineHi}</span>}
          <span className="text-ink-3">
            {BY[plan.by]}
            {plan.trace.length ? ` · ${plan.trace.length} checks` : ""} · vehicle-hours {roughCount(plan.baselineVh)} → {roughCount(plan.planVh)} computed in code
            {plan.cached ? " · cached" : ""}
          </span>
        </div>
      )}

      <div className="flex gap-[10px]">
        <button
          type="button"
          onClick={approve}
          disabled={!actionable || approving || approved || thinking}
          className="flex h-[46px] flex-1 items-center justify-center rounded-[13px] bg-accent text-[16px] font-semibold text-white disabled:opacity-50"
        >
          {approved ? "Approved" : approving ? "Approving…" : "Approve plan"}
        </button>
        {advisoryEventId && (
          <Link
            href={`/official/advisory/${advisoryEventId}`}
            className="flex h-[46px] flex-1 items-center justify-center rounded-[13px] bg-accent-tint text-[16px] font-semibold text-accent-tint-ink no-underline"
          >
            Advisory
          </Link>
        )}
      </div>
    </section>
  );
}
