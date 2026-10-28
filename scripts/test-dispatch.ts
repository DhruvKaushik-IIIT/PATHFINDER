// Crew Dispatch + advisory draft for a district, without the UI (Phase 4 Part B).
//   pnpm test:dispatch [District]      → code plan, then the agent's plan (one Wonder run ≈ $0.10–0.20)
//   pnpm test:dispatch Mandi --code    → code plan only (no AI)
import { districtOf } from "../src/lib/official/districts.ts";
import { dispatchPlan } from "../src/lib/official/planDispatch.ts";
import type { DispatchPlan } from "../src/lib/official/types.ts";

const d = districtOf(process.argv[2] ?? "Mandi");
const show = (label: string, p: DispatchPlan, ms: number) => {
  console.log(`\n== ${label} (${p.by}${p.model ? ` · ${p.model}` : ""}, ${(ms / 1000).toFixed(1)} s${p.cached ? ", cached" : ""})`);
  console.log(`${p.headline}${p.headlineHi ? `  ·  ${p.headlineHi}` : ""}`);
  for (const s of p.steps) console.log(`  [${s.action}] ${s.text}   (${s.when})`);
  console.log(`  vehicle-hours: ${p.baselineVh} → ${p.planVh}  (saves ${p.savedVh})`);
  console.log(`  why: ${p.reasoning}`);
  if (p.trace.length) console.log(`  tools: ${p.trace.join(" → ")}`);
};

let t = Date.now();
show("code plan", (await dispatchPlan(d, "PWD (test)", { ai: false })).plan, Date.now() - t);
if (!process.argv.includes("--code")) {
  t = Date.now();
  const r = await dispatchPlan(d, "PWD (test)", { ai: true });
  show("agent plan", r.plan, Date.now() - t);
  if (r.degraded) console.log(`  degraded: ${r.degraded}`);
}
