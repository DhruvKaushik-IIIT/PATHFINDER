// Phase 0: SAM 3.1 on road photos → boxes, mask areas, and an overlay preview per photo.
// Follows cookbook 07_sam/01_api_basics. ~$0.0025 per (photo × concept).
// Run: pnpm test:sam [--concepts a,b,c] [photo ...]   (defaults to every photo in data/seed/photos/)
// Previews are written to out/sam/ (git-ignored).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeMaskToSVGPath } from "@meta-sam/parser";
import sharp from "sharp";
import { hasKey } from "../src/lib/ai/clients.ts";
import { classifyError } from "../src/lib/ai/router.ts";
import { segmentImage, type SamResult } from "../src/lib/ai/sam.ts";
import { prepareImage } from "../src/lib/images/prepare.ts";

const args = process.argv.slice(2);
const ci = args.indexOf("--concepts");
const CONCEPTS = ci >= 0 ? args.splice(ci, 2)[1]!.split(",") : ["debris", "road", "vehicle", "face", "license plate"];
const COLORS: Record<string, string> = {
  debris: "#C25E00", rock: "#C25E00", boulder: "#C25E00", landslide: "#8A4300", rubble: "#C25E00", excavator: "#1A6B35", road: "#0071E3", vehicle: "#1E7B45", face: "#B3261E", "license plate": "#7B5CD6",
};

function overlaySvg(w: number, h: number, results: SamResult[]): string {
  const parts: string[] = [];
  for (const r of results) {
    const color = COLORS[r.concept] ?? "#000";
    for (const m of r.masks) {
      const { left, top, right, bottom } = m.bounds;
      const sx = (right - left) / m.record.mask.width;
      const sy = (bottom - top) / m.record.mask.height;
      parts.push(
        `<path d="${decodeMaskToSVGPath(m.record.mask)}" fill="${color}" fill-opacity="0.38" transform="translate(${left} ${top}) scale(${sx} ${sy})"/>`,
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

const dir = "data/seed/photos";
const photos = args.length
  ? args
  : (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `${dir}/${f}`);
await mkdir("out/sam", { recursive: true });

let calls = 0;
for (const photo of photos) {
  const { jpeg, width, height } = await prepareImage(await readFile(photo));
  const imgArea = width * height;
  console.log(`\n████ ${photo} (${width}×${height})`);
  const results: SamResult[] = [];
  for (const concept of CONCEPTS) {
    const t0 = Date.now();
    try {
      const r = await segmentImage(jpeg, concept);
      calls++;
      results.push(r);
      const area = r.masks.reduce((t, m) => t + m.areaPx, 0);
      console.log(
        `  ${concept.padEnd(14)} ${String(r.masks.length).padStart(2)} masks · ${((area / imgArea) * 100).toFixed(1).padStart(5)}% of image · ${Date.now() - t0} ms`,
      );
      for (const b of r.boxes.slice(0, 4)) {
        console.log(
          `      box #${b.objectId} [${b.left},${b.top} → ${b.right},${b.bottom}] ${b.right - b.left}×${b.bottom - b.top}px${b.confidence !== undefined ? ` conf ${b.confidence.toFixed(2)}` : ""}`,
        );
      }
      if (r.boxes.length > 4) console.log(`      … ${r.boxes.length - 4} more`);
    } catch (err) {
      const e = classifyError(err);
      console.log(`  ${concept.padEnd(14)} FAILED ${e.kind}${e.status ? ` ${e.status}` : ""} — ${e.message}`);
    }
  }
  const out = `out/sam/${path.parse(photo).name}-sam.jpg`;
  await writeFile(
    out,
    await sharp(jpeg).composite([{ input: Buffer.from(overlaySvg(width, height, results)) }]).jpeg({ quality: 85 }).toBuffer(),
  );
  console.log(`  overlay → ${out}`);
}
console.log(`\n${calls} SAM calls ≈ $${(calls * 0.0025).toFixed(4)}`);
