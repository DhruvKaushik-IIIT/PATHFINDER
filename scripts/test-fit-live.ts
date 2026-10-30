// "Can my vehicle cross?" live run (Phase 6C): real AI calls (~$0.01–0.02 per check).
// Usage: pnpm test:fit-live [--event Aut] [--vehicle toyota-innova-crysta | --category suv | --photo path.jpg] [--roof]
import { readFile } from "node:fs/promises";
import { select } from "../src/lib/db/supabase.ts";
import { checkVehicleFit } from "../src/lib/fit/check.ts";
import { preparePhoto } from "../src/lib/reports/processPhoto.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const place = opt("--event") ?? "Aut";
const [ev] = await select<{ id: string }>("events", `select=id&place_name=eq.${encodeURIComponent(place)}&resolved_at=is.null&limit=1`);
if (!ev) throw new Error(`no open event at ${place}`);
const photoPath = opt("--photo");
const t = Date.now();
const res = await checkVehicleFit(ev.id, {
  photo: photoPath ? await preparePhoto(await readFile(photoPath)) : null,
  vehicleId: opt("--vehicle") ?? null, category: opt("--category") ?? null, roofLoad: args.includes("--roof"),
});
console.log(`\n████ ${place} · ${Date.now() - t} ms`);
if (!res) throw new Error("event not found");
if (res.stage === "confirm") console.log("CONFIRM:", res.reason, JSON.stringify(res.identified));
else {
  const r = res.report;
  console.log(`${r.code.headline}\ncode: ${r.code.verdict} (needs ${r.code.neededM.toFixed(2)} m) ${r.code.caps.join("; ")} → final: ${r.verdict}${r.loweredBy ? ` (lowered: ${r.loweredBy})` : ""}`);
  if (r.assessment) {
    console.log(`writer ${r.assessment.by}: suggests ${r.assessment.suggestedVerdict} · ${Math.round(r.assessment.confidence * 100)}%`);
    for (const f of r.assessment.factors) console.log(`  - ${f.kind}: ${f.verdict} · ${f.detail}`);
    console.log(`  advice: ${r.assessment.overallAdvice}\n  hi: ${r.assessment.overallAdviceHi}`);
  }
  if (r.check) console.log(`checker ${r.check.by}: ${r.check.verdict} → ${r.check.suggestedVerdict} · ${r.check.reasoning}`);
  console.log(`two models: ${r.twoModels} · evidence: ${r.evidence.photos.map((p) => `${p.source} ${p.ageH} h`).join(", ")} · one lane ~ ${JSON.stringify(r.oneLaneAround)}`);
}
if (res.degraded.length) console.log("degraded:", res.degraded.join("; "));
