"use client";

// Route-row pill (Phase 6C): "Your Innova: fits / tight / won't fit / ?" from the saved vehicle + the event's gap.
// Plain code (lib/fit/fit.ts) — no AI, no request.
import { computeFit, profileFor, roadSideOf } from "@/lib/fit/fit";
import type { SavedVehicle } from "@/lib/fit/saved";
import { FIT_STYLE } from "@/lib/fit/types";

const FIT_TYPES = new Set(["landslide", "road_damage", "snow", "ice", "flood_water", "pothole", "other"]);

export default function FitPill({ vehicle, event }: { vehicle: SavedVehicle; event: { type: string; status: string; gapM?: { min: number; max: number } | null; photoAt?: string | null } }) {
  // Only where the road itself is narrowed (a jam or a notice isn't a width question).
  if (!["one_lane", "slow", "closed"].includes(event.status) || !FIT_TYPES.has(event.type)) return null;
  const p = profileFor(vehicle);
  if (!p) return null;
  const r = computeFit(p, roadSideOf({ type: event.type, status: event.status, measurements: { roadWidthLeftM: event.gapM ?? null }, photoAt: event.photoAt ?? null }));
  const st = FIT_STYLE[r.verdict];
  const short = vehicle.name.replace(/^(Maruti Suzuki|Toyota|Mahindra|Hyundai|Tata|Honda|Hero|Royal Enfield|Force|Volvo)\s+/, "");
  return (
    <span className="mt-0.5 inline-flex w-fit shrink-0 items-center self-start rounded-full px-2 py-[2px] text-[12px] font-bold" style={{ background: st.bg, color: st.ink }}>
      Your {short}: {r.verdict === "unknown" ? "?" : st.word.toLowerCase()}
    </span>
  );
}
