"use client";

// Frames 06 / 06b Photos for a road event: loads the event and hands its photos to the shared dark viewer.
import { useEffect, useState } from "react";
import { approxRange, clearWindow } from "@/lib/events/format";
import { ago, STATUS_STYLE, type EventDetail } from "@/lib/events/types";
import PhotoViewer from "./PhotoViewer";

// Light status chip for the dark viewer (design: #FFB766 etc.).
const CHIP: Record<string, string> = { open: "#5AD39C", slow: "#FFB766", one_lane: "#FFB766", closed: "#FF6B5E", unknown: "#D1D1D6" };

export default function PhotosScreen({ id }: { id: string }) {
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((r) => r.json())
      .then((b: { data?: EventDetail | null; error?: string }) => (b.data ? setEv(b.data) : setError(b.error ?? "Photos unavailable")))
      .catch(() => setError("Photos unavailable"));
  }, [id]);

  const st = ev ? (STATUS_STYLE[ev.status] ?? STATUS_STYLE.unknown) : null;
  const blocked = ev?.measurements.blockedPct;
  const clears = ev ? clearWindow(ev.etaClear) : null;

  return (
    <PhotoViewer
      photos={ev?.photos ?? []}
      loaded={Boolean(ev)}
      error={error}
      title={ev ? [ev.placeName, ev.roadRef].filter(Boolean).join(" · ") : ""}
      meta={ev ? `Verified ${Math.round(ev.confidence * 100)}%` : ""}
      chip={{ word: st ? (st.word === "One lane" ? "One lane open" : st.word) : "", bg: (ev && CHIP[ev.status]) ?? CHIP.unknown! }}
      facts={[
        ev
          ? [blocked && `${approxRange(blocked, "%")?.replace(" %", "%")} blocked`, clears && `clears ~${clears}`].filter(Boolean).join(" · ") || `updated ${ago(ev.lastConfirmedAt)}`
          : "",
        ev
          ? (["bike", "car", "bus"] as const)
              .map((k) => `${k === "bike" ? "Bikes" : k === "car" ? "Cars" : "Buses"} ${ev.passable[k] === true ? "✓" : ev.passable[k] === false ? "✕" : "?"}`)
              .join(" ")
          : "",
      ]}
      annotatedAlt="Photo with AI labels for debris, road and vehicles"
      emptyText="No photos for this event yet"
    />
  );
}
