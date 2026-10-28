// Investigator agent on real events. Writes a timeline item + may adjust confidence (that's its job).
// Usage: pnpm test:investigator [place-or-event-id …] [--force]   (no args → list doubtful events, no AI)
// Cost per run: one Spark agent (Baseten) + at most one grounded search on Meta (~$0.03–0.10).
import { select } from "../src/lib/db/supabase.ts";
import { investigateEvent, whyInvestigate } from "../src/lib/investigate/investigator.ts";
import type { InvestigatedEvent } from "../src/lib/ai/tools/investigate.ts";

const args = process.argv.slice(2);
const force = args.includes("--force");
const targets = args.filter((a) => !a.startsWith("--"));

const rows = await select<InvestigatedEvent>(
  "events",
  "select=id,segment_id,type,status,place_name,lat,lng,summary,confidence,started_at,last_confirmed_at,eta_clear,measurements,sources&resolved_at=is.null&order=last_confirmed_at.asc",
);
if (!targets.length) {
  console.log("Doubtful open events (no AI run):");
  for (const ev of rows) {
    const why = whyInvestigate(ev);
    if (why) console.log(`  ${ev.place_name} (${ev.type}, ${ev.status}, ${Math.round(ev.confidence * 100)}%) — ${why}  [${ev.id}]`);
  }
  process.exit(0);
}

for (const t of targets) {
  const ev = rows.find((r) => r.id === t || r.place_name?.toLowerCase() === t.toLowerCase());
  if (!ev) {
    console.log(`✗ no open event "${t}"`);
    continue;
  }
  const t0 = Date.now();
  const r = await investigateEvent(ev.id, { force });
  console.log(`\n== ${ev.place_name} (${ev.type}, ${ev.status}) — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`reason: ${r.reason ?? "—"}${r.skipped ? ` · skipped: ${r.skipped}` : ""}${r.degraded ? ` · degraded: ${r.degraded}` : ""}`);
  console.log(`trace (${r.trace.length}): ${r.trace.join(" → ")}`);
  if (r.note) {
    console.log(`finding: ${r.note.finding}${r.note.suggestedStatus ? ` → ${r.note.suggestedStatus}` : ""} · by ${r.note.by} · confidence ${r.note.confidenceBefore} → ${r.note.confidenceAfter}${r.note.scoutRequested ? " · scout photo requested" : ""}`);
    console.log(`EN: ${r.note.explanation}`);
    if (r.note.explanationHi) console.log(`HI: ${r.note.explanationHi}`);
    for (const e of r.note.evidence) console.log(`  - ${e}`);
  }
}
