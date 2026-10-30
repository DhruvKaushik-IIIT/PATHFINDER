"use client";

// Slope sites on the map (Phase 6B): a marker per site + the stretch it threatens, dashed risk purple.
// With a route line the stretch is the route ±1 km around the site; without one, a 1 km dashed ring.
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { circle } from "@/components/nearby/circle";
import { cumulative, pointAt, project, type Coord } from "@/lib/drive/line";
import type { SlopePin } from "@/lib/slope/types";
import SlopeMarker from "./SlopeMarker";

function stretch(coords: Coord[], cum: number[], p: SlopePin): Feature<Geometry> | null {
  const { alongKm, offKm } = project(coords, cum, [p.lng, p.lat]);
  if (offKm > 0.4) return null;
  const a = Math.max(0, alongKm - 1);
  const b = Math.min(cum.at(-1)!, alongKm + 1);
  const line: Coord[] = [pointAt(coords, cum, a), ...coords.filter((_, i) => cum[i]! > a && cum[i]! < b), pointAt(coords, cum, b)];
  return { type: "Feature", properties: { strong: p.level === "elevated" || p.level === "high" ? 1 : 0 }, geometry: { type: "LineString", coordinates: line } };
}

export default function SlopeLayer({ pins, route, onSelect }: { pins: SlopePin[]; route?: Coord[] | null; onSelect?: (p: SlopePin) => void }) {
  if (!pins.length) return null;
  const cum = route && route.length > 1 ? cumulative(route) : null;
  const lines: Feature<Geometry>[] = [];
  const rings: Feature<Geometry>[] = [];
  for (const p of pins) {
    const s = cum ? stretch(route!, cum, p) : null;
    if (s) lines.push(s);
    else rings.push({ ...circle(p.lat, p.lng, 1), properties: { strong: p.level === "elevated" || p.level === "high" ? 1 : 0 } });
  }
  const fc = (features: Feature<Geometry>[]): FeatureCollection => ({ type: "FeatureCollection", features });
  return (
    <>
      {rings.length > 0 && (
        <Source id="pf-slope-rings" type="geojson" data={fc(rings)}>
          <Layer id="pf-slope-ring-fill" type="fill" paint={{ "fill-color": "#7B5CD6", "fill-opacity": ["case", ["==", ["get", "strong"], 1], 0.14, 0.07] }} />
          <Layer id="pf-slope-ring-line" type="line" paint={{ "line-color": "#7B5CD6", "line-width": 1.5, "line-opacity": 0.7, "line-dasharray": [3, 2] }} />
        </Source>
      )}
      {lines.length > 0 && (
        <Source id="pf-slope-stretch" type="geojson" data={fc(lines)}>
          <Layer
            id="pf-slope-stretch-line"
            type="line"
            layout={{ "line-cap": "round" }}
            paint={{ "line-color": "#7B5CD6", "line-width": 8, "line-opacity": ["case", ["==", ["get", "strong"], 1], 0.85, 0.5], "line-dasharray": [1.2, 0.8] }}
          />
        </Source>
      )}
      {pins.map((p) => (
        <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="center" style={{ zIndex: 1 }}>
          <SlopeMarker pin={p} onClick={() => onSelect?.(p)} />
        </Marker>
      ))}
    </>
  );
}
