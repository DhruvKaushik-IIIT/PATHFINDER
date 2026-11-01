"use client";

// "Not in Himachal? Pick a spot" (test-log B1): judges and testers far from Himachal can still try a
// report. They pick a demo spot or drop a pin on our road layer; the photo then goes through the SAME AI
// pipeline (SAM → Muse Spark Open → Muse Spark 1.3), but the report is demo data: marked "placed on map",
// no points, never touches real events, and it fades out like a real report (docs/decisions.md, Nov 2).
import { ChevronRight, MapPin, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

export interface PickedSpot {
  lat: number;
  lng: number;
  label: string;
}

// Points on our road layer in PWD Mandi's district (so the office demo sees them). Mandi has no demo
// event (a new pin); the others add to the seeded demo events there.
const SPOTS: (PickedSpot & { note: string })[] = [
  { label: "Mandi, NH-3", lat: 31.708, lng: 76.929, note: "New spot — your report makes a new pin" },
  { label: "Pandoh, NH-3", lat: 31.67914, lng: 77.04737, note: "Demo traffic jam here" },
  { label: "Aut, NH-3", lat: 31.74356, lng: 77.20838, note: "Demo landslide here (one lane)" },
  { label: "Kataula, MDR-23", lat: 31.79735, lng: 77.01816, note: "Demo landslide here (closed)" },
  { label: "Jhiri, NH-3", lat: 31.83315, lng: 77.17063, note: "Demo road damage here" },
];

type Snap = { placeName: string | null; roadRef: string | null; distanceM: number | null };

export default function PickSpot({ reason, onPick, onClose }: { reason: string; onPick: (s: PickedSpot) => void; onClose: () => void }) {
  const [mapMode, setMapMode] = useState(false);

  if (mapMode) return <PinOnMap onPick={onPick} onBack={() => setMapMode(false)} />;

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/55 px-[14px] pb-7" role="dialog" aria-label="Pick a spot for your report">
      <div className="glass-dark max-h-[88vh] w-full max-w-[452px] overflow-y-auto rounded-[30px] px-5 pb-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[20px] font-bold leading-tight">Not in Himachal? Pick a spot</h2>
            <p className="m-0 mt-1 text-[14px] leading-[1.4] text-[#D1D1D6]">{reason}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full">
            <X size={20} aria-hidden />
          </button>
        </div>

        <ul className="m-0 mt-4 list-none overflow-hidden rounded-[16px] bg-white/10 p-0">
          {SPOTS.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className={`flex min-h-[56px] w-full items-center gap-3 px-[14px] py-[10px] text-left ${i < SPOTS.length - 1 ? "border-b-[0.5px] border-white/15" : ""}`}
              >
                <MapPin size={18} className="shrink-0 text-[#8EC5FF]" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[16px] font-semibold">{s.label}</span>
                  <span className="text-[13px] text-[#D1D1D6]">{s.note}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-white/50" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setMapMode(true)}
          className="mt-3 flex h-[50px] w-full items-center justify-center rounded-[14px] bg-white/90 text-[16px] font-semibold text-ink"
        >
          Drop a pin on the map
        </button>

        <p className="m-0 mt-3 text-[12px] leading-[1.45] text-[#D1D1D6]">
          For trying Pathfinder from anywhere. Your photo gets the same AI checks, but the report is marked
          “placed on map (demo)”, earns no points, never changes real road data and fades out like a real report.
        </p>
      </div>
    </div>
  );
}

function PinOnMap({ onPick, onBack }: { onPick: (s: PickedSpot) => void; onBack: () => void }) {
  const mapRef = useRef<MapRef>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  const onViewChange = useCallback(() => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    const here = { lat: c.lat, lng: c.lng };
    setCenter(here);
    const n = ++seq.current;
    setChecking(true);
    fetch(`/api/snap?lat=${here.lat}&lng=${here.lng}`)
      .then((r) => r.json() as Promise<{ data?: Snap }>)
      .then((r) => n === seq.current && setSnap(r.data ?? null))
      .catch(() => n === seq.current && setSnap(null))
      .finally(() => n === seq.current && setChecking(false));
  }, []);

  const onRoad = snap?.distanceM != null;
  const label = onRoad ? [snap!.placeName, snap!.roadRef].filter(Boolean).join(", ") || "a Himachal road" : null;

  return (
    <div className="absolute inset-0 z-50 bg-land text-ink" role="dialog" aria-label="Drop a pin on a Himachal road">
      <MapView mapRef={mapRef} onViewChange={onViewChange} initialView={{ latitude: 31.76, longitude: 77.08, zoom: 10.5 }} />
      {/* fixed crosshair pin in the middle of the map */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <MapPin size={40} strokeWidth={2.2} className="fill-accent text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" />
      </div>

      <div className="glass absolute inset-x-[14px] top-[54px] mx-auto flex max-w-[452px] items-center gap-3 rounded-[20px] px-4 py-3">
        <button type="button" onClick={onBack} className="-my-2 -ml-2 flex h-11 items-center px-2 text-[16px] font-medium text-link">
          Back
        </button>
        <p className="m-0 flex-1 text-[14px] text-ink-2">Move the map until the pin sits on a road (blue lines).</p>
      </div>

      <div className="glass absolute inset-x-[14px] bottom-7 mx-auto flex max-w-[452px] flex-col gap-3 rounded-[24px] p-4">
        <p className="m-0 text-[15px] font-semibold" aria-live="polite">
          {checking ? "Checking the road…" : label ? `Near ${label}` : "No Himachal road here — move closer to a road"}
        </p>
        <button
          type="button"
          disabled={!onRoad || checking || !center}
          onClick={() => center && label && onPick({ lat: center.lat, lng: center.lng, label })}
          className="flex h-[50px] items-center justify-center rounded-[14px] bg-accent text-[16px] font-semibold text-white disabled:opacity-40"
        >
          Use this spot
        </button>
      </div>
    </div>
  );
}
