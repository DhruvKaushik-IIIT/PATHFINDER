// pnpm ingest-news [--dry] [--demo] — run the news ingest once from the terminal (same code as the cron).
// --dry: search + parse + rule checks + geocode only, no DB writes. --demo: mark written rows is_demo.
// Cost ≈ $0.05–0.10 per run (one grounded Meta Spark call with ~5–12 web searches + one Baseten parse).
import { ingestNews } from "../src/lib/news/ingest.ts";

const dryRun = process.argv.includes("--dry");
const t = Date.now();
const r = await ingestNews({ dryRun, demo: process.argv.includes("--demo") });
console.log(`${r.ok ? "ok" : "DEGRADED"} · ${((Date.now() - t) / 1000).toFixed(1)} s · ${r.searches} searches · ${r.sources} sources · ${r.parsed} items parsed${dryRun ? " · DRY RUN" : ""}`);
if (r.degraded) console.log("degraded:", r.degraded);
for (const x of r.results) {
  const o = x.outcome.action === "skipped" ? `skipped (${x.outcome.reason})` : `${x.outcome.action} ${x.outcome.eventId}`;
  console.log(`- ${x.place} · ${x.road ?? "?"} · ${x.status} → ${o}\n    ${x.url}`);
}
