// Debris volume → clearing time + reopening predictor (plain code, no AI, no cost).
// Usage: pnpm test:reopening            → synthetic cases + the predictor on open DB events
import { clearingHours, debrisVolumeM3, diggingMachines, predictReopening } from "../src/lib/clearing/estimate.ts";
import { hasDb, select } from "../src/lib/db/supabase.ts";
import { reopeningFor } from "../src/lib/events/reopening.ts";

const H = 3_600_000;
const now = Date.now();
const at = (hAgo: number) => new Date(now - hAgo * H).toISOString();
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const w = (x: { earliest: string; latest: string } | null) => (x ? `${clock(x.earliest)}–${clock(x.latest)}` : "—");
let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
  if (!ok) fail++;
};

const kataula = { blockedLengthM: { min: 60, max: 90 }, blockedPct: { min: 100, max: 100 }, roadWidthLeftM: { min: 0, max: 0 } };
const v = debrisVolumeM3("landslide", kataula);
check("volume full closure", Boolean(v && v.min >= 200 && v.max <= 2000), JSON.stringify(v));
check("no volume for snow", debrisVolumeM3("snow", kataula) === null, "null");
check("no volume without length", debrisVolumeM3("landslide", { blockedPct: { min: 50, max: 60 } }) === null, "null");
check("machines", diggingMachines(["2 JCB", "1 tipper"]) === 2 && diggingMachines(["JCB", "Tipper"]) === 1, "2 · 1");
const c = clearingHours(v!, 2, kataula)!;
check("2 JCBs: one lane before full", c.oneLaneH!.max < c.fullH.max, `one lane ${c.oneLaneH!.min.toFixed(1)}–${c.oneLaneH!.max.toFixed(1)} h · full ${c.fullH.min.toFixed(1)}–${c.fullH.max.toFixed(1)} h`);

const trend = predictReopening({
  type: "landslide", status: "closed", measurements: kataula, machines: 2, now,
  points: [{ at: at(4), blockedPct: 100, source: "photo" }, { at: at(2), blockedPct: 80, source: "photo" }, { at: at(0.5), blockedPct: 62, source: "official" }],
});
check("photo trend wins", trend.method === "photo_trend" && Boolean(trend.oneLane && trend.fullyOpen), `${trend.basis} · one lane ${w(trend.oneLane)} · open ${w(trend.fullyOpen)}`);
const stalled = predictReopening({
  type: "landslide", status: "closed", measurements: kataula, machines: 0, now,
  points: [{ at: at(3), blockedPct: 100, source: "photo" }, { at: at(1), blockedPct: 100, source: "photo" }],
});
check("stalled", stalled.stalled === true && stalled.fullyOpen === null, stalled.basis);
const vol = predictReopening({ type: "landslide", status: "closed", measurements: kataula, machines: 2, now, points: [] });
check("volume fallback", vol.method === "debris_volume" && Boolean(vol.fullyOpen), `${vol.basis} · open ${w(vol.fullyOpen)}`);
const noCrew = predictReopening({ type: "landslide", status: "closed", measurements: kataula, machines: 0, now, points: [] });
check("no machine → no time", noCrew.fullyOpen === null, noCrew.basis);

if (hasDb()) {
  console.log("\nOpen events:");
  const rows = await select<{ id: string; type: string; status: string; place_name: string | null; measurements: Record<string, unknown> | null }>(
    "events", "select=id,type,status,place_name,measurements&resolved_at=is.null&order=last_confirmed_at.desc&limit=15",
  );
  for (const r of rows) {
    const p = await reopeningFor(r);
    if (p.method === "none" && !p.debrisVolumeM3) continue;
    console.log(`  ${r.place_name} (${r.type}, ${r.status}): ${p.method} · ${p.basis} · one lane ${w(p.oneLane)} · open ${w(p.fullyOpen)}`);
  }
}
process.exit(fail ? 1 : 0);
