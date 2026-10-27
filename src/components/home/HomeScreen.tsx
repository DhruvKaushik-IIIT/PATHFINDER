"use client";

// Frame 02 Home (docs/design/glass-html/Main.dc.html): map + floating glass buttons + bottom sheet.
import { Bell, Camera, ChevronRight, Eye, Layers, Mic, Navigation, Route, Search, Target, User } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import type { LatLng } from "@/components/map/MapView";

// MapLibre needs `window` → client-only.
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

export default function HomeScreen() {
  const mapRef = useRef<MapRef>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [showRoads, setShowRoads] = useState(true);
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        setMe(loc);
        setLocating(false);
        mapRef.current?.flyTo({ center: [loc.longitude, loc.latitude], zoom: Math.max(mapRef.current.getZoom(), 11) });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView mapRef={mapRef} myLocation={me} showRoadLayer={showRoads} />

      {/* top-left: profile */}
      <div className="absolute left-[14px] top-[56px] z-10">
        <Link href="/me" aria-label="Me and Scout settings" className="glass-float flex size-[46px] items-center justify-center rounded-full text-ink">
          <User size={21} strokeWidth={2} aria-hidden />
        </Link>
      </div>

      {/* top-right: alerts + layers/locate stack */}
      <div className="absolute right-[14px] top-[56px] z-10 flex flex-col gap-[10px]">
        <Link href="/alerts" aria-label="Alerts" className="glass-float relative flex size-[46px] items-center justify-center rounded-[14px] text-ink">
          <Bell size={22} strokeWidth={2} aria-hidden />
          {/* TODO(phase-3): unread badge from /api/alerts */}
        </Link>
        <div className="glass-float flex w-[46px] flex-col rounded-[14px]">
          <button
            type="button"
            aria-label={showRoads ? "Hide Pathfinder road layer" : "Show Pathfinder road layer"}
            aria-pressed={showRoads}
            onClick={() => setShowRoads((s) => !s)}
            className={`flex size-[46px] items-center justify-center ${showRoads ? "text-accent" : "text-ink"}`}
          >
            <Layers size={21} strokeWidth={2} aria-hidden />
          </button>
          <span className="mx-[10px] h-[0.5px] bg-black/15" />
          <button
            type="button"
            aria-label="Show my location"
            onClick={locate}
            className={`flex size-[46px] items-center justify-center text-accent ${locating ? "animate-pulse" : ""}`}
          >
            <Navigation size={20} strokeWidth={2} fill="currentColor" aria-hidden className="rotate-90" />
          </button>
        </div>
      </div>

      <Sheet label="Plan, explore or report" initial="half">
        <div className="flex flex-col gap-4">
          <label className="flex h-12 items-center gap-[10px] rounded-[14px] bg-[rgba(118,118,128,0.14)] px-[14px]">
            <Search size={18} strokeWidth={2.2} className="text-[#3C3C43]" aria-hidden />
            <span className="sr-only">Where to?</span>
            {/* TODO(phase-2): Photon + places.json autocomplete */}
            <input
              type="text"
              placeholder="Where to?"
              className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3"
            />
            <button type="button" aria-label="Speak destination" className="flex size-8 items-center justify-center text-[#3C3C43]">
              <Mic size={18} strokeWidth={2} aria-hidden />
            </button>
          </label>

          <div className="grid grid-cols-3 gap-[10px]">
            <Tile href="/route" label="Journey" icon={<Route size={26} strokeWidth={2} aria-hidden />} />
            <Tile href="/nearby" label="Nearby" icon={<Target size={26} strokeWidth={2} aria-hidden />} />
            <Tile href="/report" label="Report" filled icon={<Camera size={26} strokeWidth={2} aria-hidden />} />
          </div>

          {/* TODO(phase-3): real counts from /api/nearby */}
          <Row
            href="/nearby"
            lead={<span className="size-[10px] shrink-0 rounded-full bg-unknown" />}
            title="Near you right now"
            subtitle="No verified issues reported yet"
          />
          {/* TODO(phase-3): watched trips */}
          <Row
            href="/route"
            lead={<Eye size={20} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />}
            title="Watch a trip"
            subtitle="Get an alert if your route changes"
          />
        </div>
      </Sheet>
    </main>
  );
}

function Tile({ href, label, icon, filled = false }: { href: string; label: string; icon: React.ReactNode; filled?: boolean }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-[7px] text-ink no-underline">
      <span
        className={`flex h-[62px] w-full items-center justify-center rounded-2xl ${
          filled ? "bg-accent text-white" : "bg-white/80 text-accent"
        }`}
      >
        {icon}
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
    </Link>
  );
}

function Row({ href, lead, title, subtitle }: { href: string; lead: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link href={href} className="glass-card flex items-center gap-3 p-[14px] text-ink no-underline">
      {lead}
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-sm text-ink-2">{subtitle}</span>
      </span>
      <ChevronRight size={15} strokeWidth={2.6} className="text-unknown" aria-hidden />
    </Link>
  );
}
