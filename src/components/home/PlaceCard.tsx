"use client";

// Picked place: name + Directions (7.5b). Directions = GET /api/route (no AI) → summary + line on the map.
// TODO(phase-2 part C): "See route" opens the full /route screen (frame 03).
import { MapPin, Navigation, X } from "lucide-react";
import { useState } from "react";
import { clock, duration, VERDICT_STYLE } from "@/lib/geo/format";
import type { Place } from "@/lib/geo/placeTypes";
import type { RoutePlan } from "@/lib/geo/routeTypes";

export default function PlaceCard({
  place,
  origin,
  onClose,
  onRoute,
}: {
  place: Place;
  /** Where Directions start: your location, or the map's default (Mandi) with a note. */
  origin: { name: string; lat: number; lng: number; isMe: boolean };
  onClose: () => void;
  onRoute: (plan: RoutePlan | null) => void;
}) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function directions() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: `${origin.lat},${origin.lng}`,
        to: `${place.lat},${place.lng}`,
        fromName: origin.name,
        toName: place.name,
      });
      const body = (await (await fetch(`/api/route?${qs}`)).json()) as { data: RoutePlan | null; degraded?: string };
      setPlan(body.data);
      onRoute(body.data);
      if (!body.data) setError(body.degraded ?? "Routing is unavailable right now");
    } catch {
      setError("Routing is unavailable right now");
    } finally {
      setLoading(false);
    }
  }

  const best = plan?.routes[0];
  const v = best ? VERDICT_STYLE[best.verdict.verdict] : null;
  return (
    <div className="glass-card flex flex-col gap-3 p-[14px]" role="region" aria-label={`${place.name} details`}>
      <div className="flex items-start gap-3">
        <MapPin size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[17px] font-semibold">{place.name}</span>
          <span className="truncate text-[13px] text-ink-2">{place.subtitle}</span>
        </span>
        <button type="button" aria-label="Close" onClick={onClose} className="-m-2 flex size-11 shrink-0 items-center justify-center text-ink-3">
          <X size={18} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      {!plan && (
        <button
          type="button"
          onClick={directions}
          disabled={loading}
          className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white disabled:opacity-60"
        >
          <Navigation size={17} strokeWidth={2.2} className="rotate-90" fill="currentColor" aria-hidden />
          {loading ? "Checking the roads…" : `Directions from ${origin.isMe ? "your location" : origin.name}`}
        </button>
      )}
      {error && <p className="text-[14px] text-ink-2">{error}</p>}

      {best && v && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-[3px] text-[13px] font-semibold" style={{ background: v.bg, color: v.ink }}>
              {best.verdict.pill}
            </span>
            <span className="text-[15px] font-semibold">
              {best.blocked ? best.verdict.headline : `${duration(best.totalMin)} · arrive ~${clock(best.arriveAt)}`}
            </span>
          </div>
          <span className="text-[13px] text-ink-2">
            {best.distanceKm.toFixed(0)} km{best.viaRoads.length ? ` · via ${[...best.viaRoads.slice(0, 2), ...best.viaTowns.slice(0, 2)].join(" · ")}` : ""}
          </span>
          <span className="text-[13px] text-ink-2">{best.verdict.detail}</span>
          {best.hp.outsideKm >= 1 && best.hp.insideKm >= 1 && (
            <span className="text-[12px] text-ink-3">
              {best.hp.outsideKm.toFixed(0)} km outside Himachal: normal drive, live traffic not checked
              {best.hp.entry ? ` · enters Himachal near ${best.hp.entry}` : ""}
            </span>
          )}
          {plan.routes.length > 1 && <span className="text-[12px] text-ink-3">{plan.routes.length - 1} other route{plan.routes.length > 2 ? "s" : ""} shown in grey</span>}
          {!origin.isMe && <span className="text-[12px] text-ink-3">Starting from {origin.name} — use the locate button on the map to start from your location</span>}
          <span className="text-[11px] text-ink-3">Checked {clock(plan.checkedAt)} · verify with official sources</span>
        </div>
      )}
    </div>
  );
}
