"use client";

// Loads open events for the visible map area (GET /api/events?bbox=), refetching after pans.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { EventStatus, MapEvent } from "@/lib/events/types";

const SEVERITY: Record<EventStatus, number> = { open: 0, unknown: 1, slow: 2, one_lane: 3, closed: 4 };

export function useEvents(mapRef: React.RefObject<MapRef | null>) {
  const [events, setEvents] = useState<MapEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKey = useRef("");

  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    // Pad the box so small pans don't refetch; round so the cache key is stable.
    const pad = 0.25;
    const box = [b.getWest() - pad, b.getSouth() - pad, b.getEast() + pad, b.getNorth() + pad].map((x) => x.toFixed(2));
    const key = box.join(",");
    if (key === lastKey.current) return;
    lastKey.current = key;
    try {
      const res = await fetch(`/api/events?bbox=${key}`);
      const body = (await res.json()) as { ok: boolean; data?: MapEvent[] };
      // Later markers draw on top: put the most severe last so an overlap hides the milder pin.
      if (body.ok && body.data) setEvents([...body.data].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]));
    } catch {
      // Offline / server down: keep the pins we have.
    }
  }, [mapRef]);

  /** Call on map load and move end; debounced. */
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { events, refresh };
}
