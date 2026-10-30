// Slope Sentinel live run (Phase 6B): real slope photos → two-model reading → site → risk agent.
// Costs real credits: ~$0.03 per photo (SAM + 2 Spark calls) + ~$0.05–0.10 per Wonder risk run.
// Usage: pnpm test:slope-live [--at lat,lng] [--replay] [--hours-ago N] photo [photo …]
//   Photos are posted oldest first (the first one N h ago, default 20, the last one now) — all rows is_demo.
import { readFile } from "node:fs/promises";
import { hasDb } from "../src/lib/db/supabase.ts";
import { preparePhoto } from "../src/lib/reports/processPhoto.ts";
import { assessSite } from "../src/lib/slope/assess.ts";
import { submitSlopeReport } from "../src/lib/slope/submit.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args.splice(i, 1), true) : false;
};
const [lat, lng] = (opt("--at") ?? "31.7432,77.2080").split(",").map(Number) as [number, number];
const hoursAgo = Number(opt("--hours-ago") ?? 20);
const replay = flag("--replay");
const photos = args.length ? args : ["data/seed/photos/slopes/slope-scar-above-wall.jpg", "data/seed/photos/slopes/slope-seepage-road-edge.jpg"];
if (!hasDb()) throw new Error("Supabase env vars missing");

let siteId: string | null = null;
for (const [i, file] of photos.entries()) {
  const ago = photos.length > 1 ? hoursAgo * (1 - i / (photos.length - 1)) : 0;
  const t = Date.now();
  const r = await submitSlopeReport({
    photo: await preparePhoto(await readFile(file)), lat, lng, text: null, voiceWav: null,
    takenAt: new Date(Date.now() - ago * 3_600_000).toISOString(), isDemo: true,
  });
  console.log(`\n████ ${file} (${ago.toFixed(0)} h ago) → ${r.reportStatus} · site ${r.siteAction} ${r.siteId ?? ""} · ${r.observations} photo(s) · +${r.points} · ${Date.now() - t} ms`);
  console.log(`  read by ${r.reading?.by}: ${r.reading?.overall} · ${r.reading?.summary}`);
  for (const s of r.reading?.signs ?? []) console.log(`    - ${s.kind} (${s.severity}${s.looksFresh ? ", fresh" : ""}${s.aboveRoad === false ? ", below road" : ""}): ${s.note}`);
  console.log(`  check by ${r.check?.by}: ${r.check?.verdict} → ${r.check?.finalOverall}${r.check?.twoModels ? " · 2 models" : ""}${r.check?.disputedSigns.length ? ` · disputed ${r.check.disputedSigns.join(",")}` : ""} · ${r.check?.reasoning}`);
  if (r.changes.length) console.log(`  change: ${r.changes.join(" | ")}`);
  console.log(`  annotated: ${r.annotatedUrl ?? "—"}  timings ${JSON.stringify(r.timingsMs)}${r.degraded.length ? `\n  degraded: ${r.degraded.join("; ")}` : ""}`);
  siteId = r.siteId ?? siteId;
}

if (siteId) {
  const t = Date.now();
  const a = await assessSite(siteId, { trigger: "new photos of this slope", replay });
  if (a) {
    const x = a.assessment;
    console.log(`\n████ risk ${a.previous} → ${a.level} by ${x.by}${x.modelLevel ? ` (model said ${x.modelLevel})` : ""} · ${Date.now() - t} ms · alerts ${a.alerts}`);
    console.log(`  ${x.capNote ?? "no cap"}\n  rain: ${JSON.stringify(x.rain)} · slides 90 d: ${x.slides90d}`);
    for (const r of x.reasons) console.log(`  · ${r}`);
    console.log(`  advice: ${x.advice}\n  hi: ${x.adviceHi}\n  trace: ${x.trace.join(" → ")}`);
    console.log(`\n/slope/${siteId}`);
  }
}
