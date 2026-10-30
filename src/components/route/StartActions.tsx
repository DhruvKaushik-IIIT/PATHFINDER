"use client";

// Phase 6A: "Pathfinder decides the safe route, Google Maps drives it." Start (primary) opens Google
// Maps with waypoints that force Pathfinder's chosen route; Drive Watch (secondary) watches the road
// ahead while you drive. Apple Maps sits in a small menu with an honest note. Pure code, no AI.
import { Ellipsis, Navigation, Radar } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { appleMapsUrl, googleMapsUrl, pickWaypoints } from "@/lib/drive/handoff";
import type { Coord } from "@/lib/drive/line";
import type { RoutePlan } from "@/lib/geo/routeTypes";

export default function StartActions({ plan, query }: { plan: RoutePlan; query: string }) {
  const [menu, setMenu] = useState(false);
  const { google, apple, forced } = useMemo(() => {
    const [chosen, ...others] = plan.routes;
    const wps = chosen
      ? pickWaypoints(
          chosen.geometry.coordinates as Coord[],
          others.map((o) => o.geometry.coordinates as Coord[]),
        )
      : [];
    return { google: googleMapsUrl(plan.from, plan.to, wps), apple: appleMapsUrl(plan.from, plan.to), forced: wps.length };
  }, [plan]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <a
          href={google}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[52px] flex-[1.3] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-white no-underline"
        >
          <Navigation size={18} strokeWidth={2.4} aria-hidden /> Start
        </a>
        <Link
          href={`/drive?${query}`}
          className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-white/80 text-[16px] font-semibold text-link no-underline"
        >
          <Radar size={18} strokeWidth={2.2} aria-hidden /> Drive Watch
        </Link>
        <button
          type="button"
          aria-label="More ways to open this route"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-white/80 text-ink-2"
        >
          <Ellipsis size={20} aria-hidden />
        </button>
      </div>
      {menu && (
        <div className="glass-card flex flex-col gap-1 px-[14px] py-3">
          <a href={apple} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-link no-underline">
            Open in Apple Maps
          </a>
          <span className="text-[12px] text-ink-2">Apple Maps may choose a different road. Check Pathfinder alerts.</span>
        </div>
      )}
      <p className="px-1 text-[12px] text-ink-3">
        Pathfinder decides the safe route, Google Maps drives it
        {forced ? ` · ${forced} via point${forced > 1 ? "s keep" : " keeps"} Google on this road` : ""}.
      </p>
    </div>
  );
}
