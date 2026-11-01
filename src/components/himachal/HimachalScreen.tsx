"use client";

// "Across Himachal right now": the 10 open incidents/closures that affect the most people, state-wide.
// Same layout as Nearby (frame 08): map with the pins, glass back button, sheet with the ranked list.
// Ranking is plain code (lib/events/top.ts): reach first (traffic, traveller hubs, watched trips), then damage.
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import { ago, eventTitle, STATUS_STYLE, type TopResult } from "@/lib/events/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const HP_BOUNDS: [[number, number], [number, number]] = [
  [75.6, 30.4],
  [78.9, 33.2],
];

export default function HimachalScreen() {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [data, setData] = useState<TopResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/top?limit=10")
      .then((r) => r.json() as Promise<{ data: TopResult | null; degraded?: string }>)
      .then((b) => {
        if (!alive) return;
        setData(b.data);
        if (b.degraded) setToast(b.degraded);
      })
      .catch(() => alive && setToast("Couldn't reach the server — try again"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Fit all of Himachal above the sheet once the map exists.
  const needsFit = useRef(true);
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    needsFit.current = false;
    map.fitBounds(HP_BOUNDS, { padding: { top: 110, bottom: 360, left: 20, right: 20 }, duration: 0 });
  }, []);

  const c = data?.counts;
  const parts = c ? [c.closed && `${c.closed} closed`, c.oneLane && `${c.oneLane} one lane`, c.slow && `${c.slow} slow`, c.other && `${c.other} other`].filter(Boolean) : [];

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        mapRef={mapRef}
        events={data?.items ?? []}
        onSelectEvent={(e) => router.push(`/event/${e.id}`)}
        onViewChange={() => needsFit.current && fit()}
        showRoadLayer={false}
      />

      <div className="absolute inset-x-[14px] top-[54px] z-10 mx-auto flex max-w-[480px] items-center gap-[10px]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="glass-float flex size-[46px] shrink-0 items-center justify-center rounded-full text-ink"
        >
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
        </button>
        <div className="glass-float flex h-[46px] flex-1 items-center rounded-[23px] px-4 text-[15px] font-semibold text-ink">Across Himachal right now</div>
      </div>

      {toast && (
        <div className="absolute inset-x-[14px] top-[112px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Top incidents across Himachal" initial="half" halfPx={380}>
        {!data ? (
          loading ? (
            <div className="flex flex-col gap-3 py-1" aria-busy>
              <span className="h-5 w-64 animate-pulse rounded-lg bg-black/10" />
              <span className="h-5 w-48 animate-pulse rounded-lg bg-black/10" />
              <span className="h-40 animate-pulse rounded-[16px] bg-white/70" />
            </div>
          ) : (
            <p className="py-6 text-center text-[15px] text-ink-2">The Himachal overview is unavailable right now.</p>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="m-0 text-[20px] font-bold leading-tight">
                {data.items.length ? `Top ${data.items.length} across Himachal` : "All clear across Himachal"}
              </h1>
              <p className="m-0 mt-1 text-[14px] leading-[1.4] text-ink-2">
                {data.total
                  ? `${parts.join(" · ")} right now. Ranked by how many travellers and communities each one affects.`
                  : "No verified road issues anywhere in Himachal right now. Verify locally before you go."}
              </p>
            </div>

            {data.items.length > 0 && (
              <ol className="m-0 list-none rounded-[16px] bg-white/[0.82] p-0">
                {data.items.map((e, i) => {
                  const st = STATUS_STYLE[e.status];
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/event/${e.id}`}
                        className={`flex items-center gap-3 px-[14px] py-[11px] text-ink no-underline ${
                          i < data.items.length - 1 ? "border-b-[0.5px] border-black/[0.18]" : ""
                        }`}
                      >
                        <span className="w-[18px] shrink-0 text-center text-[15px] font-bold text-ink-3" aria-label={`Rank ${e.rank}`}>
                          {e.rank}
                        </span>
                        <span className="size-[10px] shrink-0 rounded-full" style={{ background: st.dot }} aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-semibold">{eventTitle(e.type, e.placeName)}</span>
                          <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                            <span className="shrink-0 rounded-full px-2 py-[2px] font-semibold" style={{ background: st.bg, color: st.ink }}>
                              {st.word}
                            </span>
                            <span className="truncate">
                              {ago(e.lastConfirmedAt)}
                              {!e.reports && e.news ? " · news, not yet confirmed" : ""}
                            </span>
                          </span>
                          <span className="text-[13px] leading-snug text-ink-2">{e.why.join(" · ")}</span>
                        </span>
                        <ChevronRight size={14} strokeWidth={2.6} className="shrink-0 text-unknown" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="glass-card p-[14px]">
              <button
                type="button"
                aria-expanded={howOpen}
                onClick={() => setHowOpen((o) => !o)}
                className="-my-2 flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold text-ink"
              >
                How this is ranked
                <ChevronDown size={16} strokeWidth={2.4} className={`text-ink-3 transition-transform ${howOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {howOpen && (
                <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-[1.45] text-ink-2">
                  <li>
                    <strong className="text-ink">Who it affects (most weight):</strong> traffic on that road (national highways carry the most
                    routes), how close it is to the places most travellers go and most people live (Manali, Shimla, Dharamshala, Kullu, Atal
                    Tunnel, …), and how many Pathfinder users are watching a trip through it.
                  </li>
                  <li>
                    <strong className="text-ink">How bad it is:</strong> closed before one lane before slow, then the size of the damage (debris
                    volume, how much of the road is blocked).
                  </li>
                  <li>Less certain reports count a little less. Vehicles/day are rough estimates by road type. Verify with official sources.</li>
                </ol>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </main>
  );
}
