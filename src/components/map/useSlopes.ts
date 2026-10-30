"use client";

// Loads slope sites with warning signs (watch+) for the visible map area (GET /api/slopes?bbox=).
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { SlopePin } from "@/lib/slope/types";

export function useSlopes(mapRef: React.RefObject<MapRef | null>) {
  const [slopes, setSlopes] = useState<SlopePin[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKey = useRef("");

  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const pad = 0.25;
    const key = [b.getWest() - pad, b.getSouth() - pad, b.getEast() + pad, b.getNorth() + pad].map((x) => x.toFixed(2)).join(",");
    if (key === lastKey.current) return;
    lastKey.current = key;
    try {
      const body = (await (await fetch(`/api/slopes?bbox=${key}`)).json()) as { ok: boolean; data?: SlopePin[] };
      if (body.ok && body.data) setSlopes(body.data);
    } catch {
      // keep what we have
    }
  }, [mapRef]);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { slopes, refresh };
}

/** Sites inside a bbox once (route / nearby screens that don't refetch on pan). */
export async function fetchSlopes(w: number, s: number, e: number, n: number): Promise<SlopePin[]> {
  try {
    const body = (await (await fetch(`/api/slopes?bbox=${[w, s, e, n].map((x) => x.toFixed(3)).join(",")}`)).json()) as { data?: SlopePin[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}
