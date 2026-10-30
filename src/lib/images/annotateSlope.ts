// Server-only: AI-annotated copy of a SLOPE photo (Phase 6B), drawn by code from SAM masks + the checked
// reading, on the privacy-blurred copy (6.2 rule 4: the evidence photo is never altered).
// Signs SAM can place (water, rocks, slide scar) get a label on the mask; signs only the model sees
// (cracks, bulges, leaning trees…) are listed as chips above the bottom strip — we never invent a position.
import sharp from "sharp";
import type { SlopeReading } from "../ai/schemas.ts";
import { SIGN_LABEL } from "../slope/types.ts";
import { bounds, esc, maskPaths } from "./annotate.ts";
import type { ConceptResults } from "./measure.ts";

const WATER = "#5AC8FA";
const ROCK = "#FF9F43";
const SCAR = "#FF6B5E";
const RISK = "#B9A6F2"; // light risk-purple chip on the dark strip
const OVERALL: Record<string, { bg: string; label: string }> = {
  none: { bg: "#D1D1D6", label: "No warning signs" },
  minor: { bg: "#D1D1D6", label: "Minor signs" },
  concerning: { bg: RISK, label: "Concerning signs" },
  severe: { bg: "#FF6B5E", label: "Severe signs" },
};
const SAM_PLACED: Record<string, string[]> = { seepage: ["water"], fresh_rockfall: ["rock", "boulder"], fresh_scar: ["landslide"] };

export interface AnnotateSlopeInput {
  jpeg: Buffer;
  width: number;
  height: number;
  sam: ConceptResults;
  /** Signs the second model didn't dispute. */
  signs: SlopeReading["signs"];
  overall: SlopeReading["overall"];
  title: string;
  subtitle: string;
}

export async function annotateSlope(a: AnnotateSlopeInput): Promise<Buffer> {
  const { width: W, height: H, sam } = a;
  const s = Math.max(0.6, W / 640);
  const fs = Math.round(13 * s);
  const pad = Math.round(6 * s);
  const strip = Math.round(54 * s);
  const parts: string[] = [];
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (x: number, y: number, w: number, h: number) => placed.some((r) => x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h);
  const label = (x: number, y: number, text: string, bg: string, anchor: "start" | "middle" = "start") => {
    const w = Math.round(text.length * fs * 0.55 + pad * 2);
    const h = Math.round(fs + pad * 1.4);
    const lx = Math.max(4, Math.min(W - w - 4, anchor === "middle" ? x - w / 2 : x));
    let ly = Math.max(4, Math.min(H - h - 4, y));
    for (let k = 1; k <= 6 && hits(lx, ly, w, h); k++) {
      const step = Math.ceil(k / 2) * (h + 4) * (k % 2 ? 1 : -1);
      ly = Math.max(4, Math.min(H - h - 4, y + step));
    }
    placed.push({ x: lx, y: ly, w, h });
    parts.push(
      `<rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="${Math.round(6 * s)}" fill="${bg}"/>`,
      `<text x="${lx + pad}" y="${ly + h / 2}" dominant-baseline="central" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${fs}" font-weight="700" fill="#1D1D1F">${esc(text)}</text>`,
    );
    return w;
  };

  const kinds = new Set(a.signs.map((x) => x.kind));
  const fresh = (k: string) => a.signs.some((x) => x.kind === k && x.looksFresh);
  // Masks only for signs the checked reading stands behind (SAM alone can't tell an old rock from a fresh one).
  if (kinds.has("fresh_scar")) parts.push(...maskPaths(sam, "landslide", SCAR, 0.3));
  if (kinds.has("fresh_rockfall")) parts.push(...maskPaths(sam, "rock", ROCK, 0.42), ...maskPaths(sam, "boulder", ROCK, 0.42));
  if (kinds.has("seepage")) parts.push(...maskPaths(sam, "water", WATER, 0.45));

  const unplaced: string[] = [];
  for (const k of kinds) {
    const text = `${SIGN_LABEL[k] ?? k}${fresh(k) ? " · fresh" : ""}`;
    const b = SAM_PLACED[k] ? bounds(sam, SAM_PLACED[k]!) : null;
    if (b) label((b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.3, text, k === "seepage" ? WATER : k === "fresh_scar" ? SCAR : ROCK, "middle");
    else if (k !== "other") unplaced.push(text);
  }

  parts.push(
    `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${W}" height="${strip * 1.4}" fill="url(#t)"/>`,
    `<rect x="0" y="${H - strip * 2.2}" width="${W}" height="${strip * 2.2}" fill="url(#b)"/>`,
    `<text x="${12 * s}" y="${22 * s}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(15 * s)}" font-weight="700" fill="#FFFFFF">${esc(a.title)}</text>`,
    `<text x="${12 * s}" y="${40 * s}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(12 * s)}" fill="#E5E5EA">${esc(a.subtitle)}</text>`,
  );
  // Model-only signs as a chip row above the bottom strip.
  let x = 12 * s;
  for (const t of unplaced.slice(0, 4)) x += label(x, H - strip * 1.75, t, "#FFFFFF") + 6 * s;
  const ov = OVERALL[a.overall] ?? OVERALL.none!;
  label(12 * s, H - strip + 8 * s, ov.label, ov.bg);
  parts.push(
    `<text x="${W - 12 * s}" y="${H - strip + 8 * s + (fs + pad * 1.4) / 2}" dominant-baseline="central" text-anchor="end" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(12 * s)}" fill="#FFFFFF">${esc("Warning signs, not a prediction · AI-annotated")}</text>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
  return sharp(a.jpeg).resize(W, H).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}
