"use client";

// Frame 07 Repairs on your route (RouteWork.dc.html): same query as /route; the plan comes from the
// server's 3-min plan cache (no AI), then the crews/official updates for the events on it.
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import CrewCard from "@/components/repairs/CrewCard";
import type { RoutePlan } from "@/lib/geo/routeTypes";
import { routeEventIds, type Repair } from "@/lib/repairs/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

export default function RepairsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [repairs, setRepairs] = useState<Repair[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const query = params.toString();

  useEffect(() => {
    const p = new URLSearchParams(query);
    const from = p.get("from");
    const to = p.get("to");
    if (!from || !to) {
      setRepairs([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const qs = new URLSearchParams({ from, to, fromName: p.get("fromName") ?? "", toName: p.get("toName") ?? "", ...(p.get("depart") && { depart: p.get("depart")! }) });
        const body = (await (await fetch(`/api/route?${qs}`)).json()) as { data: RoutePlan | null; degraded?: string };
        if (!alive) return;
        if (!body.data) {
          setRepairs([]);
          setToast(body.degraded ?? "Routing is unavailable right now");
          return;
        }
        setPlan(body.data);
        const ids = routeEventIds(body.data);
        const r = ids.length ? ((await (await fetch(`/api/repairs?ids=${ids.join(",")}`)).json()) as { data: Repair[]; degraded?: string }) : { data: [] };
        if (!alive) return;
        setRepairs(r.data);
        if ("degraded" in r && r.degraded) setToast(r.degraded);
      } catch {
        if (alive) {
          setRepairs([]);
          setToast("Couldn't reach the server — try again");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [query]);

  const atWork = (repairs ?? []).filter((r) => r.atWork).length;
  const trip = plan ? `${plan.from.name} → ${plan.to.name}` : (params.get("fromName") && `${params.get("fromName")} → ${params.get("toName")}`) || "Your route";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} routes={plan ? [plan.routes[0]!.geometry] : []} />

      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-30">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Repairs on your route" initial="half" halfPx={654}>
        <div className="flex flex-col gap-[14px]">
          <div className="flex items-start justify-between gap-[10px]">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">Repairs on your route</h1>
              <span className="text-[14px] text-ink-2">
                {trip}
                {repairs ? ` · ${atWork} crew${atWork === 1 ? "" : "s"} working now` : ""}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => (window.history.length > 1 ? router.back() : router.push(`/route?${query}`))}
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.16)] text-[#3C3C43]"
            >
              <X size={18} strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {repairs === null ? (
            <div className="flex flex-col gap-3" aria-busy>
              <span className="h-[170px] animate-pulse rounded-[18px] bg-white/70" />
              <span className="h-[170px] animate-pulse rounded-[18px] bg-white/70" />
            </div>
          ) : repairs.length === 0 ? (
            <div className="flex flex-col gap-1 rounded-[18px] bg-white/[0.84] p-4">
              <span className="text-[17px] font-bold">No crews reported on this route</span>
              <span className="text-[14px] leading-[1.4] text-ink-2">
                When a road department sends a crew or posts progress on a disruption here, it shows up on this screen.
              </span>
            </div>
          ) : (
            repairs.map((r) => <CrewCard key={r.eventId} r={r} />)
          )}

          <span className="text-center text-[12px] leading-[1.4] text-ink-2">
            Updates come straight from official road crews and are checked against recent photos.
          </span>
        </div>
      </Sheet>
    </main>
  );
}
