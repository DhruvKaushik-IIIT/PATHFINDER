"use client";

// Picked place: name + "Give Directions" (7.5b) → the /route screen (frame 03).
// Directions start from YOUR CURRENT LOCATION (asked for on tap if we don't have it yet). If location
// is off, or you want to plan from somewhere else, "Start from another place" lets you search a start.
// There is no default town: Pathfinder is for all of Himachal, not one district.
import { LocateFixed, MapPin, Navigation, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PlaceSearch from "@/components/home/PlaceSearch";
import type { LatLng } from "@/components/map/MapView";
import type { Place } from "@/lib/geo/placeTypes";

type Start = { name: string; lat: number; lng: number };

export default function PlaceCard({
  place,
  me,
  onLocated,
  onClose,
}: {
  place: Place;
  /** Your location if the map already has it. */
  me: LatLng | null;
  /** Tell the map when we found your location here, so it shows the blue dot too. */
  onLocated?: (loc: LatLng) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [start, setStart] = useState<Start | null>(null); // custom starting point
  const [choosing, setChoosing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function go(from: Start) {
    const qs = new URLSearchParams({
      from: `${from.lat.toFixed(5)},${from.lng.toFixed(5)}`,
      to: `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`,
      fromName: from.name,
      toName: place.name,
    });
    router.push(`/route?${qs}`);
  }

  function giveDirections() {
    if (start) return go(start);
    if (me) return go({ name: "Your location", lat: me.latitude, lng: me.longitude });
    if (!("geolocation" in navigator)) {
      setChoosing(true);
      setNote("This browser can't share your location. Choose where you're starting from.");
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const loc = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        onLocated?.(loc);
        go({ name: "Your location", lat: loc.latitude, lng: loc.longitude });
      },
      (err) => {
        setLocating(false);
        setChoosing(true);
        setNote(
          err.code === err.PERMISSION_DENIED
            ? "Location is off. Turn it on in your browser settings, or choose where you're starting from."
            : "Couldn't find your location. Try again, or choose where you're starting from.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

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

      <button
        type="button"
        onClick={giveDirections}
        disabled={locating}
        aria-busy={locating}
        className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white disabled:opacity-80"
      >
        <Navigation size={17} strokeWidth={2.2} className="rotate-90" fill="currentColor" aria-hidden />
        {locating ? "Finding your location…" : start ? `Directions from ${start.name}` : "Give Directions"}
      </button>

      {/* Where the trip starts: your location (default) or a place you choose. */}
      {start ? (
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className="min-w-0 flex-1 truncate">
            Starting from <strong className="text-ink">{start.name}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setStart(null);
              setNote(null);
            }}
            className="-my-3 flex h-11 shrink-0 items-center gap-1 px-1 font-semibold text-link"
          >
            <LocateFixed size={14} strokeWidth={2.2} aria-hidden />
            Use my location
          </button>
        </div>
      ) : choosing ? (
        <div className="flex flex-col gap-2">
          {note && (
            <p role="status" className="m-0 text-[13px] leading-snug text-ink-2">
              {note}
            </p>
          )}
          <PlaceSearch
            placeholder="Starting point"
            showMic={false}
            autoFocus
            onPick={(p) => {
              setStart({ name: p.name, lat: p.lat, lng: p.lng });
              setChoosing(false);
              setNote(null);
            }}
          />
          <button type="button" onClick={() => setChoosing(false)} className="-my-2 h-11 self-start px-1 text-[13px] font-semibold text-link">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className="min-w-0 flex-1 truncate">From your location</span>
          <button type="button" onClick={() => setChoosing(true)} className="-my-3 h-11 shrink-0 px-1 font-semibold text-link">
            Start from another place
          </button>
        </div>
      )}
    </div>
  );
}
