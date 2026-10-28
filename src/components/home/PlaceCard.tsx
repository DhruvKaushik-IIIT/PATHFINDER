"use client";

// Picked place: name + Directions (7.5b) → the /route screen (frame 03).
import { MapPin, Navigation, X } from "lucide-react";
import Link from "next/link";
import type { Place } from "@/lib/geo/placeTypes";

export default function PlaceCard({
  place,
  origin,
  onClose,
}: {
  place: Place;
  /** Where Directions start: your location, or the map's default (Mandi) with a note. */
  origin: { name: string; lat: number; lng: number; isMe: boolean };
  onClose: () => void;
}) {
  const qs = new URLSearchParams({
    from: `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`,
    to: `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`,
    fromName: origin.name,
    toName: place.name,
  });
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
      <Link
        href={`/route?${qs}`}
        className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white no-underline"
      >
        <Navigation size={17} strokeWidth={2.2} className="rotate-90" fill="currentColor" aria-hidden />
        Directions from {origin.isMe ? "your location" : origin.name}
      </Link>
      {!origin.isMe && <span className="text-[12px] text-ink-3">Use the locate button on the map to start from where you are.</span>}
    </div>
  );
}
