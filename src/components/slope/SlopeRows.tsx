// Slope sites as list rows (Phase 6B), for Nearby and the route sheet: risk-purple mountain, level word, place.
import { ChevronRight, Mountain } from "lucide-react";
import Link from "next/link";
import { ago } from "@/lib/events/types";
import { SLOPE_STYLE, SLOPE_WORD, type SlopePin } from "@/lib/slope/types";

export default function SlopeRows({ pins, sub, replay }: { pins: (SlopePin & { km?: number; distanceKm?: number })[]; sub?: (p: SlopePin & { km?: number; distanceKm?: number }) => string; replay?: boolean }) {
  if (!pins.length) return null;
  return (
    <ul className="m-0 list-none rounded-[16px] bg-white/[0.82] p-0" aria-label="Slope warnings">
      {pins.map((p, i) => {
        const st = SLOPE_STYLE[p.level];
        return (
          <li key={p.id}>
            <Link
              href={`/slope/${p.id}${replay ? "?replay=1" : ""}`}
              className={`flex items-center gap-3 px-[14px] py-[11px] text-ink no-underline ${i < pins.length - 1 ? "border-b-[0.5px] border-black/[0.18]" : ""}`}
            >
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(123,92,214,0.16)" }}>
                <Mountain size={14} strokeWidth={2.6} className="text-risk" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">Unstable slope{p.place ? ` near ${p.place}` : ""}</span>
                <span className="truncate text-[13px] text-ink-2">
                  {sub ? sub(p) : [p.road, p.lastObservedAt && `photo ${ago(p.lastObservedAt)}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 rounded-full px-[9px] py-[3px] text-[12px] font-bold" style={{ background: st.bg, color: st.ink }}>
                {SLOPE_WORD[p.level]}
              </span>
              <ChevronRight size={14} strokeWidth={2.6} className="shrink-0 text-unknown" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
