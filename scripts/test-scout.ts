// Scout requests end to end, plain code (no AI, no cost). Uses demo rows (is_demo) only.
// A stationary opted-in scout ~3 km from Kataula gets the request; a driver at 40 km/h never does;
// a scout with location off never does; max 2 a day; answering pays the bonus once.
// Usage: pnpm test:scout   (leaves the demo scout for screenshots: cookie pf_uid=00000000-0000-4000-a000-000000000009)
import { insert, select, update } from "../src/lib/db/supabase.ts";
import { dispatchForUser, dispatchRequest, ensureRequest, fulfilScoutRequest, scanGaps, SCOUT_BONUS } from "../src/lib/scout/requests.ts";
import { profileFor } from "../src/lib/scout/profile.ts";

const req = async (method: string, path: string, body?: unknown) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
};
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail++;
};

const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const SCOUT = uid(9);
const DRIVER = uid(10);
const OFF = uid(11);
const KATAULA = "00000000-0000-4000-8000-000000000003";
const [ev] = await select<{ segment_id: string; lat: number; lng: number }>("events", `select=segment_id,lat,lng&id=eq.${KATAULA}`);
if (!ev) throw new Error("run pnpm seed first");
const near = { coarse_lat: Math.round((ev.lat + 0.02) * 100) / 100, coarse_lng: Math.round((ev.lng + 0.01) * 100) / 100, coarse_updated_at: new Date().toISOString() };
const users = [
  { id: SCOUT, display_name: "Demo Scout", scout_opt_in: true, location_mode: "while_using", speed_kmh: 0, ...near },
  { id: DRIVER, display_name: "Demo Driver", scout_opt_in: true, location_mode: "while_using", speed_kmh: 40, ...near },
  { id: OFF, display_name: "Demo Off", scout_opt_in: true, location_mode: "off", speed_kmh: 0, ...near },
].map((u) => ({ ...u, role: "public", district: "Mandi", is_demo: true }));
await req("POST", "users?on_conflict=id", users);
// Fresh start for these demo users + any open request on Kataula's segment.
await req("DELETE", `alerts?user_id=in.(${SCOUT},${DRIVER},${OFF})`);
await req("DELETE", `reports?user_id=eq.${SCOUT}&is_demo=eq.true`); // earlier runs' answers (repeatable test)
await req("DELETE", `scout_requests?segment_id=eq.${encodeURIComponent(ev.segment_id)}`);

const r1 = await ensureRequest(ev.segment_id, "Is any lane open at Kataula now?", { isDemo: true });
const again = await ensureRequest(ev.segment_id, "same spot again", { isDemo: true });
check("one open request per segment", again.id === r1.id && again.demand_count === 2, `demand ${again.demand_count}`);

const d1 = await dispatchRequest(again);
const got = (u: string) => select<{ id: string; body: string; data: { requestId: string } }>("alerts", `select=id,body,data&user_id=eq.${u}&kind=eq.scout_request`);
const [scoutAlerts, driverAlerts, offAlerts] = await Promise.all([got(SCOUT), got(DRIVER), got(OFF)]);
check("stationary scout gets it", scoutAlerts.length === 1, scoutAlerts[0]?.body);
check("driver at 40 km/h does not", driverAlerts.length === 0);
check("location off does not", offAlerts.length === 0);
check("dispatch result", d1.sent === 1, JSON.stringify(d1));
const [after1] = await select<{ sent_to: string[] }>("scout_requests", `select=sent_to&id=eq.${r1.id}`);
check("no repeat to the same scout", (await dispatchRequest({ ...again, sent_to: after1!.sent_to })).sent === 0);

// Daily cap: the scout already has 1 today; a second request (other segment) → 2nd alert; a third → none.
const others = await select<{ segment_id: string }>("events", "select=segment_id&id=in.(00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000004)");
for (const o of others) {
  await req("DELETE", `scout_requests?segment_id=eq.${encodeURIComponent(o.segment_id)}`);
  await ensureRequest(o.segment_id, "Fresh photo please?", { isDemo: true });
}
const pulled = [await dispatchForUser({ id: SCOUT, ...near, speed_kmh: 0 }), await dispatchForUser({ id: SCOUT, ...near, speed_kmh: 0 })];
check("max 2 a day", (await got(SCOUT)).length === 2, `pull results ${JSON.stringify(pulled)}`);
check("driver pull refused", (await dispatchForUser({ id: DRIVER, ...near, speed_kmh: 40 })) === null);

// Answering: bonus once.
const [rep] = await insert<{ id: string }>("reports", { user_id: SCOUT, lat: ev.lat, lng: ev.lng, status: "accepted", event_id: KATAULA, is_demo: true, points_awarded: 10 + SCOUT_BONUS });
check("answer pays the bonus", (await fulfilScoutRequest(r1.id, rep!.id)) === SCOUT_BONUS);
check("second answer doesn't", (await fulfilScoutRequest(r1.id, rep!.id)) === 0);
await update("users", `id=eq.${SCOUT}`, { points: 10 + SCOUT_BONUS });

const me = await profileFor(SCOUT);
check("profile", me.verified === 1 && me.scoutAnswers === 1 && me.leaderboard?.district === "Mandi", `${me.name} · ${me.points} pts · rank ${me.leaderboard?.you.rank} · badges ${me.badges.filter((b) => b.earned).map((b) => b.name).join(", ")}`);

const gaps = await scanGaps(3);
console.log("data gaps (demand × gap):", gaps.map((g) => `${g.place} ${g.hoursOld} h × ${g.watchers + 1} → ${g.score}`).join(" · ") || "none");
process.exit(fail ? 1 : 0);
