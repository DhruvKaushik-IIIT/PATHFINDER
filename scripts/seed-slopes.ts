// Demo slope sites on NH-3 (Phase 6B): Aut and Jhiri, built by the REAL pipeline from the seed slope photos
// (SAM + two-model reading + risk agent), so nothing on these pages is hand-written. All rows is_demo.
// Costs real credits: ~$0.03 per photo + ~$0.03 per Muse Wonder assessment ≈ $0.15 in total.
// Usage: pnpm seed-slopes [--no-replay]     (risk uses the replayed real monsoon day unless --no-replay)
//        pnpm seed-slopes --wipe            (only delete demo slope rows + slope alerts)
import { readFile } from "node:fs/promises";
import { hasDb } from "../src/lib/db/supabase.ts";
import { preparePhoto } from "../src/lib/reports/processPhoto.ts";
import { assessSite } from "../src/lib/slope/assess.ts";
import { submitSlopeReport } from "../src/lib/slope/submit.ts";

if (!hasDb()) throw new Error("Supabase env vars missing");
const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const del = async (path: string) => {
  const res = await fetch(`${base}/${path}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`DELETE ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
};

// Slope alerts first (any user — they point at demo sites), then sites (observations cascade), then slope reports (photos/claims cascade).
await del("alerts?data->>slopeSiteId=not.is.null");
await del("scout_requests?slope_site_id=not.is.null&is_demo=eq.true");
await del("slope_sites?is_demo=eq.true");
await del("reports?kind=eq.slope&is_demo=eq.true");
console.log("wiped demo slope sites, observations, slope reports and slope alerts");
if (process.argv.includes("--wipe")) process.exit(0);

const replay = !process.argv.includes("--no-replay");
const SITES = [
  // On NH-3 by the Aut tunnel / Jhiri stretch (positions checked against our road layer in Phase 1 seed).
  { name: "Aut", at: [31.7432, 77.208], photos: ["slope-scar-above-wall", "slope-seepage-road-edge"] },
  { name: "Jhiri", at: [31.834, 77.171], photos: ["slope-slide-over-wall", "slope-rockfall-masonry-wall"] },
] as const;

for (const s of SITES) {
  let siteId: string | null = null;
  for (const [i, name] of s.photos.entries()) {
    const ago = i === 0 ? 20 : 0; // first photo 20 h ago, second now → change over time
    const r = await submitSlopeReport({
      photo: await preparePhoto(await readFile(`data/seed/photos/slopes/${name}.jpg`)),
      lat: s.at[0] + i * 0.0004, lng: s.at[1], text: null, voiceWav: null,
      takenAt: new Date(Date.now() - ago * 3_600_000).toISOString(), isDemo: true,
    });
    console.log(`${s.name} · ${name}: ${r.reportStatus} · ${r.reading?.overall ?? "—"} → ${r.check?.finalOverall ?? "—"}${r.check?.twoModels ? " (2 models)" : ""} · site ${r.siteAction}`);
    siteId = r.siteId ?? siteId;
  }
  if (!siteId) continue;
  const a = await assessSite(siteId, { trigger: "new photos of this slope", replay });
  console.log(`  risk → ${a?.level} by ${a?.assessment.by}${a?.assessment.capNote ? ` (${a.assessment.capNote})` : ""} · alerts ${a?.alerts ?? 0}\n  ${a?.assessment.reasons[0] ?? ""}\n  /slope/${siteId}`);
}
