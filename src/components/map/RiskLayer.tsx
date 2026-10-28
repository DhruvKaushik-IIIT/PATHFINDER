"use client";

// Risk areas on the map (CLAUDE.md 7.6): purple 22% fill, dashed outline; light rain fainter.
import type { MultiPolygon, Polygon } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import type { RiskLevel } from "@/lib/risk/types";

export default function RiskLayer({ id, areas }: { id: string; areas: { polygon: Polygon | MultiPolygon; level: RiskLevel }[] }) {
  if (!areas.length) return null;
  return (
    <Source
      id={id}
      type="geojson"
      data={{
        type: "FeatureCollection",
        features: areas.map((a) => ({ type: "Feature", properties: { strong: a.level === "moderate" || a.level === "high" ? 1 : 0 }, geometry: a.polygon })),
      }}
    >
      <Layer
        id={`${id}-fill`}
        type="fill"
        paint={{ "fill-color": "#7B5CD6", "fill-opacity": ["case", ["==", ["get", "strong"], 1], 0.22, 0.1] }}
      />
      <Layer
        id={`${id}-line`}
        type="line"
        filter={["==", ["get", "strong"], 1]}
        paint={{ "line-color": "#7B5CD6", "line-width": 1.5, "line-opacity": 0.8, "line-dasharray": [3, 2] }}
      />
    </Source>
  );
}
