"use client";

// Slope photos (Phase 6B) in the shared frame-06 dark viewer: newest first, annotated by code.
import { useEffect, useState } from "react";
import PhotoViewer from "@/components/event/PhotoViewer";
import { keptSigns } from "@/lib/slope/metrics";
import { SIGN_LABEL, SLOPE_WORD, type SlopeObservation, type SlopeSite } from "@/lib/slope/types";

const CHIP: Record<string, string> = { none: "#D1D1D6", watch: "#D9CFF7", elevated: "#B9A6F2", high: "#B9A6F2" };

export default function SlopePhotosScreen({ id }: { id: string }) {
  const [d, setD] = useState<{ site: SlopeSite; observations: SlopeObservation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/slopes/${id}`)
      .then((r) => r.json())
      .then((b: { data?: { site: SlopeSite; observations: SlopeObservation[] }; error?: string }) => (b.data ? setD(b.data) : setError(b.error ?? "Photos unavailable")))
      .catch(() => setError("Photos unavailable"));
  }, [id]);
  const obs = (d?.observations ?? []).filter((o) => o.check?.verdict !== "reject" && o.photos);
  const latest = obs[0];
  return (
    <PhotoViewer
      photos={obs.map((o) => ({ id: o.id, publicUrl: o.photos!.public_url, annotatedUrl: o.photos!.annotated_url, createdAt: o.created_at, source: "traveller" }))}
      loaded={Boolean(d)}
      error={error}
      title={d ? [d.site.place_name, d.site.road_ref].filter(Boolean).join(" · ") || "Slope" : ""}
      meta={latest?.check?.twoModels ? "2 models checked" : "Slope photo"}
      chip={{ word: d ? `${SLOPE_WORD[d.site.risk_level]} risk` : "", bg: CHIP[d?.site.risk_level ?? "none"]! }}
      facts={[latest ? keptSigns(latest).map((k) => SIGN_LABEL[k] ?? k).join(" · ") || "No clear signs" : "", "Warning signs, not a prediction"]}
      annotatedAlt="Slope photo with AI labels for water, loose rocks and fresh slide scars"
      emptyText="No slope photos yet"
    />
  );
}
