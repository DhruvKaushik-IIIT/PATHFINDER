// Phase 2: Route Check agent end-to-end (no server). Prints the plan summary, which tier/model ran,
// the tool calls it made, and the verdict. Wonder tier ≈ $0.10–0.15 per run (cached 20 min in-process).
// Run: pnpm test:route-check [fromLat,fromLng toLat,toLng FromName ToName]
import { checkRoute } from "../src/lib/geo/check.ts";

const [f = "31.708,76.932", t = "32.469,77.132", fn = "Mandi", tn = "Sissu"] = process.argv.slice(2);
const [fl, fg] = f.split(",").map(Number);
const [tl, tg] = t.split(",").map(Number);
const t0 = Date.now();
const { plan, check, degraded } = await checkRoute({ name: fn, lat: fl!, lng: fg! }, { name: tn, lat: tl!, lng: tg! }, new Date());
console.log(`\n${fn} → ${tn} · ${Date.now() - t0} ms · tier ${check.tier} · by ${check.by}${check.cached ? " (cached)" : ""}${degraded ? ` · degraded: ${degraded}` : ""}`);
for (const r of plan.routes) console.log(`  ${r.id}${r.recommended ? "★" : " "} ${r.distanceKm} km · ${r.totalMin} min · ${r.verdict.pill}`);
console.log("\ntools:", check.trace.join("\n       "));
console.log("\nverdict:", JSON.stringify(check.verdict, null, 2));
