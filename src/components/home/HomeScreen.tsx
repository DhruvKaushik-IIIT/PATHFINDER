"use client";

// Frame 02 Home (docs/design/glass-html/Main.dc.html): map + floating glass buttons + bottom sheet.
import { Bell, Camera, ChevronRight, Eye, Layers, MapPin, Navigation, Route, Target, User } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Marker, type MapRef } from "react-map-gl/maplibre";
import PlaceCard from "@/components/home/PlaceCard";
import PlaceSearch from "@/components/home/PlaceSearch";
import Sheet from "@/components/glass/Sheet";
import EventPeek from "@/components/map/EventPeek";
import type { LatLng } from "@/components/map/MapView";
import { useEvents } from "@/components/map/useEvents";
import SlopeLayer from "@/components/map/SlopeLayer";
import { useSlopes } from "@/components/map/useSlopes";
import { useLocationPing } from "@/components/me/useLocationPing";
import { STATUS_STYLE, type MapEvent, type NearbyResult } from "@/lib/events/types";
import type { Place } from "@/lib/geo/placeTypes";
import { routeUrl, type WatchedTrip } from "@/lib/watch/types";

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
  const { events, refresh } = useEvents(mapRef);
  const { slopes, refresh: refreshSlopes } = useSlopes(mapRef);
  const router = useRouter();
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Place | null>(null);
  const onSearchActive = useCallback((active: boolean) => setSearching(active), []);
  const near = useNearby(me);
  // Scouts: coarse location every 5 min while the app is open, only if they chose "While using" on /me.
  const [locationOn, setLocationOn] = useState(false);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ data?: { settings: { locationMode: string } } | null }>)
      .then((b) => setLocationOn(b.data?.settings.locationMode === "while_using"))
      .catch(() => {});
  }, []);
  useLocationPing(locationOn);
  const { unread, watching } = useRoadWatch();

  function pick(p: Place) {
    setPicked(p);
    setSelected(null);
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(mapRef.current.getZoom(), 10) });
  }

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
      <MapView
        mapRef={mapRef}
        myLocation={me}
        showRoadLayer={showRoads}
        events={events}
        selectedEventId={selected?.id ?? null}
        onSelectEvent={setSelected}
        onViewChange={() => {
          refresh();
          refreshSlopes();
        }}
      >
        <SlopeLayer pins={slopes} onSelect={(p) => router.push(`/slope/${p.id}`)} />
        {picked && (
          <Marker latitude={picked.lat} longitude={picked.lng} anchor="bottom">
            <MapPin size={34} strokeWidth={2} className="text-accent drop-shadow" fill="white" aria-label={picked.name} />
          </Marker>
        )}
      </MapView>

      {selected && (
        <div className="absolute inset-x-[14px] top-[214px] z-20 mx-auto max-w-[452px]">
          <EventPeek event={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* top-left: profile */}
      <div className="absolute left-[14px] top-[56px] z-10">
        <Link href="/me" aria-label="Me and Scout settings" className="glass-float flex size-[46px] items-center justify-center rounded-full text-ink">
          <User size={21} strokeWidth={2} aria-hidden />
        </Link>
      </div>

      {/* top-right: alerts + layers/locate stack */}
      <div className="absolute right-[14px] top-[56px] z-10 flex flex-col gap-[10px]">
        <Link href="/alerts" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"} className="glass-float relative flex size-[46px] items-center justify-center rounded-[14px] text-ink">
          <Bell size={22} strokeWidth={2} aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-closed px-1 text-[12px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
              <span className="sr-only"> unread</span>
            </span>
          )}
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
          <PlaceSearch onPick={pick} onFocusChange={onSearchActive} />

          {picked && !searching && (
            <PlaceCard
              key={picked.id}
              place={picked}
              origin={me ? { name: "Your location", lat: me.latitude, lng: me.longitude, isMe: true } : { name: "Mandi", lat: 31.708, lng: 76.932, isMe: false }}
              onClose={() => setPicked(null)}
            />
          )}

          {!searching && (
          <>
          <div className="grid grid-cols-3 gap-[10px]">
            <Tile href="/route" label="Journey" icon={<Route size={26} strokeWidth={2} aria-hidden />} />
            <Tile href="/nearby" label="Nearby" icon={<Target size={26} strokeWidth={2} aria-hidden />} />
            <Tile href="/report" label="Report" filled icon={<Camera size={26} strokeWidth={2} aria-hidden />} />
          </div>

          <Row
            href={me ? `/nearby?lat=${me.latitude.toFixed(4)}&lng=${me.longitude.toFixed(4)}` : "/nearby"}
            lead={<span className="size-[10px] shrink-0 rounded-full" style={{ background: near.dot }} />}
            title={me ? "Near you right now" : "Around Mandi right now"}
            subtitle={near.text}
          />
          {watching ? (
            <Row
              href={routeUrl(watching.from, watching.to, watching.departAt)}
              lead={<Eye size={20} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />}
              title={`Watching ${watching.from.name} → ${watching.to.name}`}
              subtitle={watching.lastVerdict?.headline ?? "Road Watch is on"}
            />
          ) : (
            <Row
              href="/route"
              lead={<Eye size={20} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />}
              title="Watch a trip"
              subtitle="Get an alert if your route changes"
            />
          )}
          </>
          )}
        </div>
      </Sheet>
    </main>
  );
}

/** Alerts bell badge + the first watched trip for the "Watching …" row. */
function useRoadWatch(): { unread: number; watching: WatchedTrip | null } {
  const [unread, setUnread] = useState(0);
  const [watching, setWatching] = useState<WatchedTrip | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/alerts")
      .then((r) => r.json() as Promise<{ data: { unread: number } }>)
      .then((b) => alive && setUnread(b.data?.unread ?? 0))
      .catch(() => {});
    fetch("/api/watch")
      .then((r) => r.json() as Promise<{ data: WatchedTrip[] }>)
      .then((b) => alive && setWatching(b.data?.[0] ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return { unread, watching };
}

/** Counts for the "Near you right now" row: /api/nearby without the AI summary (free). */
function useNearby(me: LatLng | null): { text: string; dot: string } {
  const [res, setRes] = useState<NearbyResult | null>(null);
  const lat = me?.latitude.toFixed(2) ?? "31.71";
  const lng = me?.longitude.toFixed(2) ?? "76.93";
  useEffect(() => {
    let alive = true;
    fetch(`/api/nearby?lat=${lat}&lng=${lng}&radiusKm=25&summary=0`)
      .then((r) => r.json() as Promise<{ data: NearbyResult | null }>)
      .then((b) => alive && setRes(b.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lat, lng]);
  if (!res) return { text: "Checking roads within 25 km…", dot: STATUS_STYLE.unknown.dot };
  const c = res.counts;
  const parts = [c.closed && `${c.closed} closed`, c.oneLane && `${c.oneLane} one lane`, c.slow && `${c.slow} slow`].filter(Boolean);
  if (!parts.length) return { text: "No verified issues within 25 km", dot: STATUS_STYLE.open.dot };
  const top = res.items[0];
  const where = top?.placeName ? ` · ${STATUS_STYLE[top.status].word.toLowerCase()} near ${top.placeName}` : "";
  return { text: `${parts.join(" · ")} within 25 km${where}`, dot: STATUS_STYLE[c.closed ? "closed" : "slow"].dot };
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
