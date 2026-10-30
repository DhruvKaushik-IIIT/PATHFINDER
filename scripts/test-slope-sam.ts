// Phase 6B gate: which SAM 3.1 concepts actually find slope warning signs?
// Runs every candidate concept on the slope photos → boxes, mask areas, an overlay per photo,
// then a summary of which concepts detected something on which photos. ~$0.0025 per (photo × concept).
// Run: pnpm test:slope-sam [--concepts a,b,c] [photo ...]   (defaults to data/seed/photos/slopes/)
// Overlays are written to out/sam-slope/ (git-ignored).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeMaskToSVGPath } from "@meta-sam/parser";
import sharp from "sharp";
import { hasKey } from "../src/lib/ai/clients.ts";
import { classifyError } from "../src/lib/ai/router.ts";
import { segmentImage, type SamResult } from "../src/lib/ai/sam.ts";
import { prepareImage } from "../src/lib/images/prepare.ts";

const COLORS: Record<string, string> = {
  crack: "#B3261E", fissure: "#B3261E", water: "#0071E3", "wet soil": "#0058B0", rock: "#C25E00", boulder: "#8A4300",
  "fallen tree": "#1A6B35", "leaning tree": "#1E7B45", "bare soil": "#7B5CD6", "retaining wall": "#48484A", landslide: "#A1251C",
};
const args = process.argv.slice(2);
const ci = args.indexOf("--concepts");
const CONCEPTS = ci >= 0 ? args.splice(ci, 2)[1]!.split(",") : Object.keys(COLORS);

function overlaySvg(w: number, h: number, results: SamResult[]): string {
  const parts: string[] = [];
  for (const r of results) {
    const color = COLORS[r.concept] ?? "#000";
    for (const m of r.masks) {
      const { left, top, right, bottom } = m.bounds;
      const sx = (right - left) / m.record.mask.width;
      const sy = (bottom - top) / m.record.mask.height;
      parts.push(
        `<path d="${decodeMaskToSVGPath(m.record.mask)}" fill="${color}" fill-opacity="0.35" transform="translate(${left} ${top}) scale(${sx} ${sy})"/>`,
      );
    }
    for (const b of r.boxes) {
      parts.push(
        `<rect x="${b.left}" y="${b.top}" width="${b.right - b.left}" height="${b.bottom - b.top}" fill="none" stroke="${color}" stroke-width="2"/>`,
        `<text x="${b.left + 3}" y="${Math.max(12, b.top - 3)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${r.concept}${b.confidence !== undefined ? ` ${b.confidence.toFixed(2)}` : ""}</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join("")}</svg>`;
}

if (!hasKey("meta")) {
  console.log("MODEL_API_KEY missing — SAM runs on Meta only.");
  process.exit(1);
}

const dir = "data/seed/photos/slopes";
const photos = args.length
  ? args
  : (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `${dir}/${f}`);
await mkdir("out/sam-slope", { recursive: true });

// concept → photo name → { masks, pct }
const summary = new Map<string, Map<string, { masks: number; pct: number }>>();
let calls = 0;
for (const photo of photos) {
  const name = path.parse(photo).name;
  const { jpeg, width, height } = await prepareImage(await readFile(photo));
  const imgArea = width * height;
  console.log(`\n████ ${photo} (${width}×${height})`);
  const runs = await Promise.all(
    CONCEPTS.map(async (concept) => {
      const t0 = Date.now();
      try {
        return { concept, r: await segmentImage(jpeg, concept), ms: Date.now() - t0 };
      } catch (err) {
        return { concept, err: classifyError(err), ms: Date.now() - t0 };
      }
    }),
  );
  const results: SamResult[] = [];
  for (const run of runs) {
    if (!("r" in run) || !run.r) {
      const e = run.err!;
      console.log(`  ${run.concept.padEnd(14)} FAILED ${e.kind}${e.status ? ` ${e.status}` : ""} — ${e.message}`);
      continue;
    }
    calls++;
    const r = run.r;
    results.push(r);
    const pct = (r.masks.reduce((t, m) => t + m.areaPx, 0) / imgArea) * 100;
    if (!summary.has(run.concept)) summary.set(run.concept, new Map());
    summary.get(run.concept)!.set(name, { masks: r.masks.length, pct });
    console.log(`  ${run.concept.padEnd(14)} ${String(r.masks.length).padStart(2)} masks · ${pct.toFixed(1).padStart(5)}% of image · ${run.ms} ms`);
    for (const b of r.boxes.slice(0, 3)) {
      console.log(
        `      box #${b.objectId} [${b.left},${b.top} → ${b.right},${b.bottom}] ${b.right - b.left}×${b.bottom - b.top}px${b.confidence !== undefined ? ` conf ${b.confidence.toFixed(2)}` : ""}`,
      );
    }
    if (r.boxes.length > 3) console.log(`      … ${r.boxes.length - 3} more`);
  }
  const out = `out/sam-slope/${name}-sam.jpg`;
  await writeFile(out, await sharp(jpeg).composite([{ input: Buffer.from(overlaySvg(width, height, results)) }]).jpeg({ quality: 85 }).toBuffer());
  console.log(`  overlay → ${out}`);
}

console.log("\n──── Summary: photos where each concept found something (masks · % of image)");
for (const concept of CONCEPTS) {
  const hits = [...(summary.get(concept) ?? new Map()).entries()].filter(([, v]) => v.masks > 0);
  console.log(
    `  ${concept.padEnd(14)} ${hits.length}/${photos.length}  ${hits.map(([n, v]) => `${n.replace(/^slope-/, "")} ${v.masks}·${v.pct.toFixed(1)}%`).join(" | ") || "—"}`,
  );
}
console.log(`\n${calls} SAM calls ≈ $${(calls * 0.0025).toFixed(4)}`);
