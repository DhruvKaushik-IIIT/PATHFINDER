// Phase 6E task 1: real road photos (EXIF stripped, in data/seed/photos/) spread across Himachal, each run
// through the REAL report pipeline (SAM privacy blur + measurement → Muse Spark Open claim → Muse Spark 1.3
// verifier → event + annotated copy). Rows are then marked is_demo so `pnpm seed --wipe` removes them.
// Points are vertices of our OSM road layer, so every event snaps to a real road.
// Costs real credits: ~$0.03 per photo. Usage: pnpm seed-real-photos [--dry]
import { readFile } from "node:fs/promises";
import { select, update } from "../src/lib/db/supabase.ts";
import { preparePhoto } from "../src/lib/reports/processPhoto.ts";
import { findDuplicate, submitReport } from "../src/lib/reports/submit.ts";

const PHOTOS = [
  { file: "river-washout-town", lat: 32.06545, lng: 77.13211, where: "NH-3 near Raison (Kullu–Manali)" },
  { file: "road-edge-collapse-valley", lat: 31.45037, lng: 77.63101, where: "NH-5 at Rampur Bushahr" },
  { file: "flood-eats-highway", lat: 32.55246, lng: 76.12631, where: "Chamba–Pathankot road at Chamba" },
  { file: "boulders-car-gorge", lat: 30.89318, lng: 77.00366, where: "NH-5 at Chakki Mor (Parwanoo–Solan)" },
  { file: "riverbank-road-collapse", lat: 31.54805, lng: 78.00339, where: "NH-5 near Tapri (Kinnaur)" },
];

const dry = process.argv.includes("--dry");
for (const p of PHOTOS) {
  const photo = await preparePhoto(await readFile(`data/seed/photos/${p.file}.jpg`));
  const known = await findDuplicate(photo.sha256);
  if (known) {
    console.log(`${p.file}: already reported (event ${known.event_id ?? "none"}) — skipped`);
    continue;
  }
  if (dry) {
    console.log(`${p.file} → ${p.where}`);
    continue;
  }
  const t = Date.now();
  const r = await submitReport({ photo, lat: p.lat, lng: p.lng, text: null, voiceWav: null });
  // Demo content: everything this report created is wipeable.
  await update("reports", `id=eq.${r.reportId}`, { is_demo: true });
  await update("photos", `report_id=eq.${r.reportId}`, { is_demo: true });
  await update("claims", `report_id=eq.${r.reportId}`, { is_demo: true });
  if (r.eventId && r.eventAction === "created") {
    await update("events", `id=eq.${r.eventId}`, { is_demo: true });
    await update("event_timeline", `event_id=eq.${r.eventId}`, { is_demo: true });
  }
  const c = r.claims[0];
  console.log(
    `${p.file} → ${p.where}: ${r.reportStatus} · ${r.eventAction} · ${r.placeName ?? "?"} ${r.road?.ref ?? ""} · ` +
      `${c?.eventType}/${r.verdict?.correctedStatus ?? c?.status} · ${r.modelsAgreed >= 2 ? "2 models agree" : `verified by ${r.verifiedBy}`} · ` +
      `${Math.round((Date.now() - t) / 1000)} s\n   ${r.annotatedUrl ?? "(no annotated copy)"}${r.degraded.length ? `\n   degraded: ${r.degraded.join("; ")}` : ""}`,
  );
}
const n = await select<{ id: string }>("events", "select=id&is_demo=is.true&resolved_at=is.null");
console.log(`open demo events now: ${n.length}`);
