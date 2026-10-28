"use client";

// Frame 08 Nearby (docs/design/glass-html/Nearby.dc.html): radius circle on the map, floating glass
// radius picker, sheet with the AI summary + ranked list. Centre = ?lat&lng[&name], else your
// location, else Mandi.
import { ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import { ago, STATUS_STYLE, TYPE_WORD, type NearbyResult } from "@/lib/events/types";
import { circle } from "./circle";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const RADII = [5, 10, 25, 50] as const;
const MANDI = { lat: 31.708, lng: 76.932, name: "Mandi" };
const BY: Record<string, string> = { baseten: "Muse Spark Open", meta: "Muse Spark", mock: "mock data", code: "Pathfinder" };

type Center = { lat: number; lng: number; name: string | null; isMe: boolean };

export default function NearbyScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(() => {
    const r = Number(params.get("r"));
    return (RADII as readonly number[]).includes(r) ? (r as (typeof RADII)[number]) : 25;
  });
  const [data, setData] = useState<NearbyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [hindi, setHindi] = useState(false);

  // 1. Where are we looking? URL → my location (quick, coarse) → Mandi.
  useEffect(() => {
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    if (params.get("lat") && Number.isFinite(lat) && Number.isFinite(lng)) {
      setCenter({ lat, lng, name: params.get("name"), isMe: false });
      return;
    }
    if (!("geolocation" in navigator)) return setCenter({ ...MANDI, isMe: false });
    navigator.geolocation.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude, name: null, isMe: true }),
      () => setCenter({ ...MANDI, isMe: false }),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60_000 },
    );
  }, [params]);

  // 2. Load the ranked list + summary for this centre and radius.
  useEffect(() => {
    if (!center) return;
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams({ lat: center.lat.toFixed(4), lng: center.lng.toFixed(4), radiusKm: String(radius) });
    if (center.name) qs.set("name", center.name);
    fetch(`/api/nearby?${qs}`)
      .then((r) => r.json() as Promise<{ data: NearbyResult | null; degraded?: string }>)
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
  }, [center, radius]);

  // Fit the circle once the map exists (it loads after the first effect run) and on radius change.
  const needsFit = useRef(true);
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    needsFit.current = false;
    const dLat = radius / 111;
    const dLng = radius / (111 * Math.cos((center.lat * Math.PI) / 180));
    map.fitBounds(
      [
        [center.lng - dLng, center.lat - dLat],
        [center.lng + dLng, center.lat + dLat],
      ],
      // Leave room for the radius picker on top and the sheet below.
      { padding: { top: 120, bottom: 330, left: 24, right: 24 }, duration: 600 },
    );
  }, [center, radius]);
  useEffect(() => {
    needsFit.current = true;
    fit();
  }, [fit]);

  const place = data?.center.name ?? center?.name ?? (center?.isMe ? "you" : "Mandi");

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        mapRef={mapRef}
        events={data?.items ?? []}
        onSelectEvent={(e) => router.push(`/event/${e.id}`)}
        onViewChange={() => needsFit.current && fit()}
        myLocation={center?.isMe ? { latitude: center.lat, longitude: center.lng } : null}
        showRoadLayer={false}
      >
        {center && (
          <Source id="pf-radius" type="geojson" data={circle(center.lat, center.lng, radius)}>
            <Layer id="pf-radius-fill" type="fill" paint={{ "fill-color": "#0071E3", "fill-opacity": 0.08 }} />
            <Layer
              id="pf-radius-line"
              type="line"
              paint={{ "line-color": "#0071E3", "line-opacity": 0.55, "line-width": 1.5, "line-dasharray": [3, 2] }}
            />
          </Source>
        )}
      </MapView>

      {/* top: back + radius picker */}
      <div className="absolute inset-x-[14px] top-[54px] z-10 mx-auto flex max-w-[480px] items-center gap-[10px]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="glass-float flex size-[46px] shrink-0 items-center justify-center rounded-full text-ink"
        >
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
        </button>
        <div role="radiogroup" aria-label="Search radius" className="glass-float flex flex-1 gap-[2px] rounded-[23px] p-[3px]">
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={r === radius}
              onClick={() => setRadius(r)}
              className={`h-[38px] flex-1 rounded-[19px] text-[14px] ${
                r === radius ? "bg-accent font-semibold text-white" : "font-medium text-ink"
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>
      {/* TODO(phase-3): rain-risk layer chip (Part C, Risk Forecast) */}

      {toast && (
        <div className="absolute inset-x-[14px] top-[112px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Nearby road conditions" initial="half" halfPx={340}>
        {!data ? (
          loading ? (
            <div className="flex flex-col gap-3 py-1" aria-busy>
              <span className="h-5 w-64 animate-pulse rounded-lg bg-black/10" />
              <span className="h-5 w-48 animate-pulse rounded-lg bg-black/10" />
              <span className="h-32 animate-pulse rounded-[16px] bg-white/70" />
            </div>
          ) : (
            <p className="py-6 text-center text-[15px] text-ink-2">Nearby is unavailable right now.</p>
          )
        ) : (
          <div className={`flex flex-col gap-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            <div>
              <p className="m-0 text-[15px] leading-[1.4]">
                <strong>
                  Within {data.radiusKm} km of {place}:
                </strong>{" "}
                {data.summary.replace(new RegExp(`^Within ${data.radiusKm} km of [^:]+:\\s*`), "")}
              </p>
              {hindi && data.summaryHi && (
                <p lang="hi" className="m-0 mt-1 text-[14px] leading-[1.45] text-ink-2">
                  {data.summaryHi}
                </p>
              )}
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1 text-[12px] text-ink-3">
                <span>
                  {data.summaryBy === "code" ? "Counted from verified events" : `Summary by ${BY[data.summaryBy] ?? data.summaryBy}`} · verify
                  with official sources
                </span>
                {data.summaryHi && (
                  <button
                    type="button"
                    lang={hindi ? undefined : "hi"}
                    aria-pressed={hindi}
                    onClick={() => setHindi((h) => !h)}
                    className="-my-3 h-11 px-1 text-[12px] font-semibold text-link"
                  >
                    {hindi ? "Hide Hindi" : "हिन्दी में पढ़ें"}
                  </button>
                )}
              </p>
            </div>

            {data.items.length > 0 ? (
              <ul className="m-0 list-none rounded-[16px] bg-white/[0.82] p-0">
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
                        <span className="size-[10px] shrink-0 rounded-full" style={{ background: st.dot }} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-semibold">
                            {st.word} · {e.placeName ? `near ${e.placeName}` : (e.roadRef ?? "road")}
                          </span>
                          <span className="truncate text-[13px] text-ink-2">
                            {TYPE_WORD[e.type] ?? "Road issue"}
                            {e.roadRef ? ` · ${e.roadRef}` : ""} · {e.distanceKm < 1 ? "<1" : Math.round(e.distanceKm)} km ·{" "}
                            {ago(e.lastConfirmedAt)}
                            {!e.reports && e.news ? " · news" : ""}
                          </span>
                        </span>
                        <ChevronRight size={14} strokeWidth={2.6} className="shrink-0 text-unknown" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="glass-card flex items-center gap-3 p-[14px]">
                <span className="size-[10px] shrink-0 rounded-full bg-open" />
                <span className="text-[15px]">
                  All clear — no verified issues. Try a bigger radius{radius < 50 ? "" : " or another place"}.
                </span>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}
