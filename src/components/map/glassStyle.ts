// Restyle the OpenFreeMap "liberty" style to the Pathfinder Glass map look
// (CLAUDE.md 7.6 + docs/design/glass-html/Map.dc.html). Works on layer ids, so it
// degrades gracefully if OpenFreeMap renames a layer (that layer just keeps its colour).
import type { StyleSpecification } from "maplibre-gl";

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

const LAND = "#E7EDE3";
const GREEN = "#DCE4D7";
const FOREST = "#D5DFCF";
const WATER = "#A9CBEA";
const SNOW = "#F4F6F7";
const CASING = "#C7CFC2";
const LABEL = "#3A3A3C";

type Layer = StyleSpecification["layers"][number];

function paint(layer: Layer, values: Record<string, unknown>) {
  (layer as { paint?: Record<string, unknown> }).paint = {
    ...((layer as { paint?: Record<string, unknown> }).paint ?? {}),
    ...values,
  };
}
function hide(layer: Layer) {
  (layer as { layout?: Record<string, unknown> }).layout = {
    ...((layer as { layout?: Record<string, unknown> }).layout ?? {}),
    visibility: "none",
  };
}

export function glassify(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    const id = layer.id;
    if (id === "background") paint(layer, { "background-color": LAND });
    else if (id === "natural_earth") paint(layer, { "raster-opacity": 0.18 }); // faint relief at low zoom
    else if (id === "park") paint(layer, { "fill-color": GREEN, "fill-outline-color": "rgba(0,0,0,0)" });
    else if (id === "park_outline") hide(layer);
    else if (id === "landcover_wood") paint(layer, { "fill-color": FOREST, "fill-opacity": 0.9 });
    else if (id === "landcover_grass") paint(layer, { "fill-color": GREEN });
    else if (id === "landcover_ice") paint(layer, { "fill-color": SNOW });
    else if (id === "landcover_sand") paint(layer, { "fill-color": "#E6E8DE" });
    else if (id === "landuse_residential") paint(layer, { "fill-color": "rgba(60,60,67,0.06)" });
    else if (id.startsWith("landuse_")) paint(layer, { "fill-color": "#E0E6DB" });
    else if (id === "water") paint(layer, { "fill-color": WATER });
    else if (id.startsWith("waterway_") && layer.type === "line") paint(layer, { "line-color": WATER });
    else if (id.startsWith("aeroway")) paint(layer, layer.type === "fill" ? { "fill-color": "#E3E6E0" } : { "line-color": "#F2F3F0" });
    else if (/(rail)/.test(id) && layer.type === "line") paint(layer, { "line-color": CASING });
    else if (/casing/.test(id) && layer.type === "line") paint(layer, { "line-color": CASING });
    else if (/^(road|bridge|tunnel)_/.test(id) && layer.type === "line") paint(layer, { "line-color": "#FFFFFF" });
    else if (id === "building") paint(layer, { "fill-color": "#DDE2D8", "fill-outline-color": "#D0D6CB" });
    else if (id === "building-3d") hide(layer);
    else if (id.startsWith("poi_") || /shield/.test(id) || id === "road_shield_us") hide(layer);
    else if (layer.type === "symbol" && (id.startsWith("label_") || id.startsWith("highway-name") || id === "airport")) {
      paint(layer, { "text-color": LABEL, "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.2 });
    } else if (layer.type === "symbol" && id.startsWith("water")) {
      paint(layer, { "text-color": "#4A6E94", "text-halo-color": "rgba(255,255,255,0.8)" });
    }
  }
  return style;
}

const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Liberty → Glass. If it fails, positron as-is; if that fails too, the caller shows a plain land colour. */
export async function loadGlassStyle(): Promise<StyleSpecification> {
  try {
    const res = await fetch(MAP_STYLE_URL);
    if (!res.ok) throw new Error(`map style ${res.status}`);
    return glassify((await res.json()) as StyleSpecification);
  } catch {
    const res = await fetch(FALLBACK_STYLE_URL);
    if (!res.ok) throw new Error(`fallback map style ${res.status}`);
    return (await res.json()) as StyleSpecification;
  }
}
