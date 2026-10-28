// Phase 1: photo pipeline on seed photos, no database → privacy pass + SAM measurements.
// 8 SAM calls per photo ≈ $0.02. Run: pnpm test:pipeline [photo ...]
// Writes the public (blurred) copy to out/pipeline/ (git-ignored).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { preparePhoto, processPhoto } from "../src/lib/reports/processPhoto.ts";

const dir = "data/seed/photos";
const args = process.argv.slice(2);
const photos = args.length
  ? args
  : (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `${dir}/${f}`);
await mkdir("out/pipeline", { recursive: true });

let cost = 0;
for (const photo of photos) {
  const t0 = Date.now();
  const p = await processPhoto(await preparePhoto(await readFile(photo)));
  cost += p.samCostUsd;
  console.log(`\n████ ${photo} (${p.width}×${p.height}) · ${Date.now() - t0} ms · sha ${p.sha256.slice(0, 12)}`);
  for (const s of p.sam) console.log(`  ${s.concept.padEnd(14)} ${s.ok ? `${String(s.boxes.length).padStart(2)} found · ${s.areaPct}%` : "FAILED"}`);
  console.log(`  privacy: ${p.facesBlurred ? `${p.blurredRegions} region(s) blurred` : "NOT run → thumbnail only"}`);
  console.log("  measurements:", JSON.stringify(p.measurements, null, 2).replace(/\n/g, "\n  "));
  if (p.degraded.length) console.log("  degraded:", p.degraded.join("; "));
  const out = `out/pipeline/${path.parse(photo).name}-public.jpg`;
  await writeFile(out, p.public);
  console.log(`  public copy → ${out}`);
}
console.log(`\nSAM ≈ $${cost.toFixed(4)}`);
