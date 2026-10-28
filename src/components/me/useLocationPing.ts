"use client";

// While the app is open and the user chose "Location: While using", send a coarse location every
// 5 minutes (the server rounds it to ~1 km and keeps no history). Opted-in scouts who are stationary
// can then get a nearby scout request. Nothing is sent when location is off.
import { useEffect } from "react";

const EVERY_MS = 5 * 60_000;

export function pingOnce(): void {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const speed = p.coords.speed; // m/s, often null (desktop / no GPS fix)
      fetch("/api/me/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, speedKmh: speed == null ? null : Math.round(speed * 3.6) }),
      }).catch(() => {});
    },
    () => {},
    { maximumAge: 60_000, timeout: 15_000 },
  );
}

export function useLocationPing(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    pingOnce();
    const t = setInterval(() => document.visibilityState === "visible" && pingOnce(), EVERY_MS);
    return () => clearInterval(t);
  }, [enabled]);
}
