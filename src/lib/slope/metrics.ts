// Slope Sentinel, plain code: SAM areas → sign metrics, and how signs changed between photos.
// Photos of the same slope differ in angle and zoom, so every comparison is labelled approximate.
import type { SignMetrics, SlopeObservation } from "./types.ts";
import { SIGN_LABEL } from "./types.ts";

interface SamSummaryLike {
  concept: string;
  ok: boolean;
  boxes: { left: number; top: number; right: number; bottom: number }[];
  areaPct: number;
}

const METRIC_CONCEPTS = ["rock", "boulder", "landslide", "water", "tree"];

/** Normalise areas to the retaining wall's box when SAM found one (≥3% of the frame), else to the whole image. */
export function signMetrics(sam: SamSummaryLike[], width: number, height: number): SignMetrics {
  const wall = sam.find((s) => s.concept === "retaining wall" && s.ok && s.boxes.length);
  const wallPct = wall
    ? (wall.boxes.reduce((t, b) => t + (b.right - b.left) * (b.bottom - b.top), 0) / (width * height)) * 100
    : 0;
  const useWall = wallPct >= 3;
  const concepts: SignMetrics["concepts"] = {};
  for (const c of METRIC_CONCEPTS) {
    const s = sam.find((x) => x.concept === c && x.ok);
    if (!s) continue;
    const norm = useWall ? s.areaPct / wallPct : s.areaPct / 100;
    concepts[c] = { count: s.boxes.length, areaPct: s.areaPct, norm: Math.round(norm * 1000) / 1000 };
  }
  return { ref: useWall ? "retaining wall" : "image", rough: !useWall, concepts };
}

const LABEL: Record<string, string> = { rock: "loose-rock area", boulder: "boulder area", landslide: "fresh slide area", water: "water on the slope", tree: "tree cover" };

function ago(fromIso: string, toIso: string): string {
  const h = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000;
  if (h < 1.5) return "an hour ago";
  if (h < 36) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Sign kinds a checked reading still stands behind (disputed signs dropped; rejected → none). */
export function keptSigns(o: Pick<SlopeObservation, "reading" | "check">): string[] {
  if (!o.reading || o.check?.verdict === "reject") return [];
  const disputed = new Set(o.check?.disputedSigns ?? []);
  return [...new Set(o.reading.signs.map((s) => s.kind).filter((k) => !disputed.has(k)))];
}

/**
 * Change between the newest photo and the previous one within 7 days:
 * per SAM concept (area normalised to the reference) and sign kinds newly seen by the models.
 * Output lines like "loose-rock area ~3× larger than 18 h ago" · "Water seeping: new since 2 days ago".
 */
export function changeLines(observations: SlopeObservation[]): string[] {
  const sorted = [...observations].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latest = sorted.at(-1);
  if (!latest) return [];
  const weekAgo = new Date(latest.created_at).getTime() - 7 * 24 * 3_600_000;
  const prev = sorted
    .slice(0, -1)
    .filter((o) => new Date(o.created_at).getTime() >= weekAgo && o.check?.verdict !== "reject")
    .at(-1);
  if (!prev) return [];
  const when = ago(prev.created_at, latest.created_at);
  const lines: string[] = [];
  const a = "concepts" in prev.sign_metrics ? prev.sign_metrics : null;
  const b = "concepts" in latest.sign_metrics ? latest.sign_metrics : null;
  if (a && b) {
    const rough = a.ref !== b.ref || b.rough;
    for (const c of ["landslide", "rock", "boulder", "water"]) {
      const x = a.concepts[c]?.norm ?? 0;
      const y = b.concepts[c]?.norm ?? 0;
      // Ignore tiny areas: under ~0.5% of the frame it's noise between two hand-held photos.
      if (Math.max(x, y) < (b.ref === "image" ? 0.005 : 0.03)) continue;
      if (x === 0 && y > 0) lines.push(`${cap(LABEL[c]!)}: new since ${when}`);
      else if (y >= x * 1.5) lines.push(`${cap(LABEL[c]!)} ~${fmtRatio(y / x)} larger than ${when}`);
      else if (y <= x / 1.5) lines.push(`${cap(LABEL[c]!)} ~${fmtRatio(x / Math.max(y, 1e-6))} smaller than ${when}`);
    }
    if (rough && lines.length) lines.push("Rough comparison: no fixed reference in both photos");
  }
  const before = new Set(keptSigns(prev));
  for (const k of keptSigns(latest)) if (!before.has(k)) lines.push(`${SIGN_LABEL[k] ?? k}: new since ${when}`);
  // The model's "seepage" says the same as SAM's new water, in better words.
  return lines.some((l) => l.startsWith(SIGN_LABEL.seepage!)) ? lines.filter((l) => !l.startsWith("Water on the slope: new")) : lines;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const fmtRatio = (r: number) => (r >= 10 ? "10×+" : `${Math.round(r * 10) / 10}×`.replace(".0×", "×"));
