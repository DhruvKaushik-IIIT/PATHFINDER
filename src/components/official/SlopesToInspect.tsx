"use client";

// Command Centre "Slopes to inspect" (Phase 6B): warning signs above district roads, ranked by level × traffic.
// "Send crew to inspect" only writes a timeline item — the slope risk never changes a road's status.
import { Mountain } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago } from "@/lib/events/types";
import type { SlopeToInspect } from "@/lib/slope/inspect";
import { SLOPE_STYLE, SLOPE_WORD } from "@/lib/slope/types";

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

export default function SlopesToInspect({ onMessage }: { onMessage: (m: string) => void }) {
  const [list, setList] = useState<SlopeToInspect[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/official/slopes")
      .then((r) => r.json() as Promise<{ data?: SlopeToInspect[] }>)
      .then((b) => setList(b.data ?? []))
      .catch(() => setList([]));
  }, []);

  async function send(s: SlopeToInspect) {
    setBusy(s.id);
    try {
      const r = await fetch(`/api/official/slopes/${s.id}/inspect`, { method: "POST" });
      if (!r.ok) throw new Error();
      setList((l) => l?.map((x) => (x.id === s.id ? { ...x, inspectSentAt: new Date().toISOString() } : x)) ?? null);
      onMessage(`Inspection noted on the slope near ${s.place ?? "the road"}`);
    } catch {
      onMessage("Couldn't record the inspection — try again");
    } finally {
      setBusy(null);
    }
  }

  if (!list?.length) return null;
  return (
    <section aria-label="Slopes to inspect" className="flex flex-col gap-[10px]">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="m-0 text-[17px] font-bold">Slopes to inspect</h2>
        <span className="text-[13px] text-ink-2">Level × traffic</span>
      </div>
      {list.map((s) => {
        const st = SLOPE_STYLE[s.level];
        return (
          <div key={s.id} className="flex flex-col gap-2 rounded-[16px] bg-white/[0.86] p-[14px]">
            <Link href={`/slope/${s.id}`} className="flex items-start gap-3 text-ink no-underline">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(123,92,214,0.16)" }}>
                <Mountain size={14} strokeWidth={2.6} className="text-risk" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[15px] font-bold leading-tight">Slope near {s.place ?? s.road ?? "road"}</span>
                  <span className="shrink-0 rounded-full px-2 py-[3px] text-[12px] font-bold" style={{ background: st.bg, color: st.ink }}>
                    {SLOPE_WORD[s.level]}
                  </span>
                </span>
                <span className="line-clamp-2 text-[13px] leading-[1.35] text-ink-2">
                  {[s.road, `~${fmt(s.vehiclesPerDay)} veh/day`, s.lastObservedAt && `photo ${ago(s.lastObservedAt)}`].filter(Boolean).join(" · ")}
                  {s.headline ? ` · ${s.headline}` : ""}
                </span>
              </span>
            </Link>
            <button
              type="button"
              disabled={busy === s.id || Boolean(s.inspectSentAt)}
              onClick={() => void send(s)}
              className="flex min-h-[44px] items-center justify-center rounded-[14px] bg-accent-tint text-[15px] font-semibold text-accent-tint-ink disabled:opacity-60"
            >
              {s.inspectSentAt ? `Crew sent to inspect · ${ago(s.inspectSentAt)}` : busy === s.id ? "Sending…" : "Send crew to inspect"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
