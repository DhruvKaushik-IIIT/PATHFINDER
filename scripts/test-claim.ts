// Phase 1: photo → SAM measurements → claim (Baseten Spark Open → Meta Spark) → verifier (Meta Spark).
// No database. ~$0.02 SAM + ~$0.01 AI per photo. Run: pnpm test:claim [--voice note.wav] [--text "..."] [photo ...]
import { readdir, readFile } from "node:fs/promises";
import { transcribe, verifyClaim, writeClaim } from "../src/lib/ai/router.ts";
import { preparePhoto, processPhoto } from "../src/lib/reports/processPhoto.ts";

const args = process.argv.slice(2);
const take = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const voice = take("--voice");
const text = take("--text") ?? null;
const dir = "data/seed/photos";
const photos = args.length ? args : (await readdir(dir)).filter((f) => /\.jpe?g$/i.test(f)).map((f) => `${dir}/${f}`);

const transcript = voice ? (await transcribe(await readFile(voice))).data : null;
if (voice) console.log("transcript:", transcript ?? "FAILED");

for (const photo of photos) {
  const t0 = Date.now();
  const p = await processPhoto(await preparePhoto(await readFile(photo)));
  const t1 = Date.now();
  const c = await writeClaim({
    jpeg: p.original, placeName: "Aut", roadRef: "NH3", lat: 31.75, lng: 77.2, at: new Date().toISOString(),
    samMeasurements: p.measurements, transcript: transcript?.text ?? null, text,
  });
  const t2 = Date.now();
  console.log(`\n████ ${photo} · SAM ${t1 - t0} ms · claim ${c.source}/${c.model} ${t2 - t1} ms${c.degraded ? ` · degraded: ${c.degraded}` : ""}`);
  console.log(JSON.stringify(c.data, null, 2));
  const first = c.data?.claims[0];
  if (!first) continue;
  const v = await verifyClaim(p.original, first, "Photo taken just now by a traveller at the report location.");
  console.log(`── verifier ${v.data.by} · ${Date.now() - t2} ms${v.degraded ? ` · degraded: ${v.degraded}` : ""}`);
  console.log(JSON.stringify(v.data.verdict, null, 2));
}
