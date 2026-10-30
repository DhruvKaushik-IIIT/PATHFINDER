// Server-only: AI-annotated copy of a report photo, drawn by CODE (sharp + SVG) from SAM masks and
// the verified claim (CLAUDE.md 6.2 rule 4). Drawn on the privacy-blurred copy and stored next to
// it — the evidence photo itself is never altered. Look follows docs/design/glass-html/Photos.dc.html.
import { decodeMaskToSVGPath } from "@meta-sam/parser";
import sharp from "sharp";
import type { Claim } from "../ai/schemas.ts";
import type { ConceptResults, Range } from "./measure.ts";

const DEBRIS = "#FF9F43";
const MACHINE = "#5AD39C";
const ROAD = "#0071E3";
const STATUS: Record<string, { bg: string; label: string }> = {
  open: { bg: "#5AD39C", label: "Open" },
  slow: { bg: "#FFB766", label: "Slow" },
  one_lane: { bg: "#FFB766", label: "One lane open" },
  closed: { bg: "#FF6B5E", label: "Closed" },
  unknown: { bg: "#D1D1D6", label: "Status unclear" },
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "~5 m" when the range is tight, "~3–8 m" when it isn't. */
export function approx(r: Range | null | undefined, unit = "m"): string | null {
  if (!r) return null;
  const mid = (r.min + r.max) / 2;
  const fmt = (x: number) => (x < 10 ? x.toFixed(1).replace(/\.0$/, "") : String(Math.round(x)));
  return r.max - r.min <= Math.max(1, mid * 0.3) ? `~${fmt(mid)} ${unit}` : `~${fmt(r.min)}–${fmt(r.max)} ${unit}`;
}

export function maskPaths(results: ConceptResults, concept: string, color: string, opacity: number): string[] {
  return (results[concept]?.masks ?? []).map((m) => {
    const { left, top, right, bottom } = m.bounds;
    const sx = (right - left) / m.record.mask.width;
    const sy = (bottom - top) / m.record.mask.height;
    return `<path d="${decodeMaskToSVGPath(m.record.mask)}" fill="${color}" fill-opacity="${opacity}" transform="translate(${left} ${top}) scale(${sx} ${sy})"/>`;
  });
}

/** Union bounds of all masks for the given concepts. */
export function bounds(results: ConceptResults, concepts: string[]) {
  let b: { left: number; top: number; right: number; bottom: number } | null = null;
  for (const c of concepts)
    for (const m of results[c]?.masks ?? []) {
      b = b
        ? { left: Math.min(b.left, m.bounds.left), top: Math.min(b.top, m.bounds.top), right: Math.max(b.right, m.bounds.right), bottom: Math.max(b.bottom, m.bounds.bottom) }
        : { ...m.bounds };
    }
  return b;
}

export interface AnnotateInput {
  jpeg: Buffer; // the PUBLIC (blurred) copy
  width: number;
  height: number;
  sam: ConceptResults;
  claim: Claim;
  title: string; // "Aut · NH3"
  subtitle: string; // "12:15 PM · Traveller · Verified 86%"
}

export async function annotate(a: AnnotateInput): Promise<Buffer> {
  const { width: W, height: H, sam, claim } = a;
  const s = Math.max(0.6, W / 640); // scale labels with the image
  const fs = Math.round(13 * s);
  const pad = Math.round(6 * s);
  const parts: string[] = [];

  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (x: number, y: number, w: number, h: number) =>
    placed.some((r) => x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h);

  const label = (x: number, y: number, text: string, bg: string, anchor: "start" | "middle" = "start") => {
    const w = Math.round(text.length * fs * 0.55 + pad * 2);
    const h = Math.round(fs + pad * 1.4);
    const lx = Math.max(4, Math.min(W - w - 4, anchor === "middle" ? x - w / 2 : x));
    let ly = Math.max(4, Math.min(H - h - 4, y));
    // Nudge down (then up) until it doesn't cover an earlier label.
    for (let k = 1; k <= 6 && hits(lx, ly, w, h); k++) {
      const step = Math.ceil(k / 2) * (h + 4) * (k % 2 ? 1 : -1);
      ly = Math.max(4, Math.min(H - h - 4, y + step));
    }
    placed.push({ x: lx, y: ly, w, h });
    parts.push(
      `<rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="${Math.round(6 * s)}" fill="${bg}"/>`,
      `<text x="${lx + pad}" y="${ly + h / 2}" dominant-baseline="central" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${fs}" font-weight="700" fill="#1D1D1F">${esc(text)}</text>`,
    );
  };

  // Masks first (under the labels).
  parts.push(...maskPaths(sam, "road", ROAD, 0.16));
  parts.push(...maskPaths(sam, "landslide", DEBRIS, 0.38), ...maskPaths(sam, "rock", DEBRIS, 0.45));
  const machines = [
    ...(sam.excavator?.boxes ?? []).map((b) => ({ b, text: "JCB" })),
    ...(sam.vehicle?.boxes ?? []).filter((b) => b.bottom - b.top >= 18 * s).slice(0, 4).map((b) => ({ b, text: "Vehicle" })),
  ];
  for (const { b } of machines)
    parts.push(`<rect x="${b.left}" y="${b.top}" width="${b.right - b.left}" height="${b.bottom - b.top}" rx="${3 * s}" fill="none" stroke="${MACHINE}" stroke-width="${2 * s}"/>`);

  // Labels with the measured numbers.
  const debris = bounds(sam, ["landslide", "rock"]);
  const len = approx(claim.measurements.blockedLengthM);
  if (debris && claim.eventType !== "clear") {
    // The slide/rock masks are "debris" for a landslide, but the broken slope for a collapsed road.
    const what = claim.eventType === "road_damage" ? "Collapsed road" : "Debris";
    label((debris.left + debris.right) / 2, debris.top + (debris.bottom - debris.top) * 0.4, len ? `${what} · ${len} long` : what, DEBRIS, "middle");
  }
  for (const { b, text } of machines.slice(0, 3)) label(b.left, b.top - fs - pad * 2, text, MACHINE);
  const strip = Math.round(54 * s);
  const road = bounds(sam, ["road"]);
  const leftM = claim.measurements.roadWidthLeftM;
  const left = leftM && leftM.max < 0.5 ? "No road left" : leftM ? `Road left ${approx(leftM)}` : null;
  // Keep it clear of the bottom info strip.
  if (road && left) label((road.left + road.right) / 2, Math.min(road.bottom - fs * 3, H - strip * 1.9), left, "#FFFFFF", "middle");

  // Top + bottom info strips (dark glass look).
  parts.push(
    `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${W}" height="${strip * 1.4}" fill="url(#t)"/>`,
    `<rect x="0" y="${H - strip * 1.4}" width="${W}" height="${strip * 1.4}" fill="url(#b)"/>`,
    `<text x="${12 * s}" y="${22 * s}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(15 * s)}" font-weight="700" fill="#FFFFFF">${esc(a.title)}</text>`,
    `<text x="${12 * s}" y="${40 * s}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(12 * s)}" fill="#E5E5EA">${esc(a.subtitle)}</text>`,
  );
  const st = STATUS[claim.eventType === "clear" ? "open" : claim.status] ?? STATUS.unknown!;
  label(12 * s, H - strip + 8 * s, st.label, st.bg);
  const blocked = claim.measurements.blockedPct;
  const blockedText = !blocked || claim.eventType === "clear" ? null
    : blocked.min >= 95 ? "Fully blocked" : `Blocked ${approx(blocked, "%")!.replace(" %", "%")}`;
  const facts = [blockedText, "AI-annotated · estimates"]
    .filter(Boolean)
    .join(" · ");
  parts.push(
    `<text x="${W - 12 * s}" y="${H - strip + 8 * s + (fs + pad * 1.4) / 2}" dominant-baseline="central" text-anchor="end" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(12 * s)}" fill="#FFFFFF">${esc(facts)}</text>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
  return sharp(a.jpeg)
    .resize(W, H) // the public copy is the same size as the original unless privacy failed (we never annotate then)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
