// Copy a road photo into data/seed/photos/ with EXIF stripped and max 1280 px.
// Run: node scripts/import-seed-photo.ts <input> <name>
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { prepareImage } from "../src/lib/images/prepare.ts";

const [input, name] = process.argv.slice(2);
if (!input || !name) {
  console.log("usage: node scripts/import-seed-photo.ts <input> <name>");
  process.exit(1);
}
const { jpeg, width, height } = await prepareImage(await readFile(input));
await mkdir("data/seed/photos", { recursive: true });
const out = `data/seed/photos/${name}.jpg`;
await writeFile(out, jpeg);
const meta = await sharp(jpeg).metadata();
console.log(`${out} · ${width}×${height} · ${(jpeg.length / 1024).toFixed(0)} KB · exif=${meta.exif ? "PRESENT" : "none"}`);
