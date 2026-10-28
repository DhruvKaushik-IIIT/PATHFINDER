// pnpm test:road-watch — end-to-end Road Watch check on real data (all rows is_demo):
// 1. a demo device user watches Mandi → Manali (snapshot, no AI)
// 2. a demo "landslide, closed" appears on NH-3 near Bajaura → event-driven Road Watch → agent re-plans → alert
// 3. the slide is cleared → Road Watch again → "no longer slows your route" alert
// Prints the alerts and the demo user id (set it as the pf_uid cookie to see them on /alerts).
// Cost: 2 Route Check agent runs (Wonder tier because of the closure) ≈ $0.2–0.35.
import { insert, select, update } from "../src/lib/db/supabase.ts";
import { runRoadWatch, watchTrip } from "../src/lib/watch/roadWatch.ts";

const MANDI = { name: "Mandi", lat: 31.708, lng: 76.932 };
const MANALI = { name: "Manali", lat: 32.2432, lng: 77.1892 };
// On NH-3 between Kullu and Bhuntar (Bajaura) — every Mandi → Manali option passes here.
const SLIDE = { lat: 31.84737, lng: 77.16884 };

const keepUser = process.argv.find((a) => a.startsWith("--user="))?.slice(7);
const [user] = keepUser ? [{ id: keepUser }] : await insert<{ id: string }>("users", { role: "public", display_name: "Road Watch test", is_demo: true });
console.log("demo user:", user!.id);

let t = Date.now();
const trip = await watchTrip(user!.id, MANDI, MANALI, null, null);
await update("watched_trips", `id=eq.${trip.id}`, { is_demo: true });
console.log(`1. watching ${trip.from.name} → ${trip.to.name} (${trip.id}) · ${trip.lastVerdict?.headline} · ${Date.now() - t} ms`);

const [seg] = await select<{ id: string; road_ref: string }>("road_segments", "select=id,road_ref&road_ref=eq.NH3&limit=1"); // sanity: NH3 exists
const [ev] = await insert<{ id: string }>("events", {
  type: "landslide", status: "closed", place_name: "Bajaura", lat: SLIDE.lat, lng: SLIDE.lng,
  summary: "Landslide near Bajaura: NH-3 closed, debris across both lanes.", summary_hi: "बजौरा के पास भूस्खलन: NH-3 बंद।",
  confidence: 0.85, sources: { reports: 2, official: 0, news: 0, notices: 0 }, models_agreed: 2, is_demo: true,
  eta_clear: { earliest: new Date(Date.now() + 3 * 3_600_000).toISOString(), latest: new Date(Date.now() + 6 * 3_600_000).toISOString() },
});
console.log(`2. demo event ${ev!.id} (closed near Bajaura; NH3 ${seg ? "ok" : "missing"})`);
t = Date.now();
console.log("   road watch →", JSON.stringify(await runRoadWatch([SLIDE])), `${((Date.now() - t) / 1000).toFixed(1)} s`);

await update("events", `id=eq.${ev!.id}`, { status: "open", resolved_at: new Date().toISOString() });
console.log("3. slide cleared");
t = Date.now();
console.log("   road watch →", JSON.stringify(await runRoadWatch([SLIDE])), `${((Date.now() - t) / 1000).toFixed(1)} s`);

await update("alerts", `user_id=eq.${user!.id}`, { is_demo: true });
for (const a of await select<{ title: string; body: string; data: { url: string; by: string } }>("alerts", `select=title,body,data&user_id=eq.${user!.id}&order=created_at.asc`)) {
  console.log(`\n🔔 ${a.title}\n   ${a.body}\n   by ${a.data.by} · ${a.data.url}`);
}
