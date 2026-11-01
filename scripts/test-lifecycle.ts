// pnpm test:lifecycle — shelf life rules (docs/event-lifecycle.md). No AI, no network.
import { lifecycleOf, shelfLifeH } from "../src/lib/events/lifecycle.ts";
import { applyTap, noWeight, passWeight } from "../src/lib/events/stillThere.ts";

let fail = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? `  — ${info}` : ""}`);
  if (!ok) fail++;
};
const NOW = Date.parse("2026-11-01T12:00:00Z");
const hAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const state = (e: Parameters<typeof lifecycleOf>[0]) => lifecycleOf(e, NOW);

// The table
check("traffic 6 h", shelfLifeH("traffic", "slow") === 6);
check("accident closed 12 h, else 6 h", shelfLifeH("accident", "closed") === 12 && shelfLifeH("accident", "one_lane") === 6);
check("ice 24 h", shelfLifeH("ice", "slow") === 24);
check("snow 24 h / closed 48 h", shelfLifeH("snow", "one_lane") === 24 && shelfLifeH("snow", "closed") === 48);
check("water 24 h / closed 48 h", shelfLifeH("flood_water", "slow") === 24 && shelfLifeH("flood_water", "closed") === 48);
check("landslide slow 24 · one lane 48 · closed 72", shelfLifeH("landslide", "slow") === 24 && shelfLifeH("landslide", "one_lane") === 48 && shelfLifeH("landslide", "closed") === 72);
check("road damage 5 d / closed 7 d", shelfLifeH("road_damage", "one_lane") === 120 && shelfLifeH("road_damage", "closed") === 168);
check("pothole medium 14 d, severe 21 d", shelfLifeH("pothole", "slow", "medium") === 336 && shelfLifeH("pothole", "one_lane", "severe") === 504);
check("other 24 h", shelfLifeH("other", "slow") === 24);

// States
const slide = { type: "landslide", status: "one_lane", reports: 2 };
check("one-lane slide 10 h old → active", state({ ...slide, lastConfirmedAt: hAgo(10) }).state === "active");
const half = state({ ...slide, lastConfirmedAt: hAgo(30) });
check("one-lane slide 30 h old → unconfirmed", half.state === "unconfirmed", half.reason ?? "");
const gone = state({ ...slide, lastConfirmedAt: hAgo(50) });
check("one-lane slide 50 h old → expired, says removed", gone.state === "expired" && /removed automatically/.test(gone.reason ?? ""), gone.reason ?? "");
check("closed slide 3 days → expired", state({ type: "landslide", status: "closed", reports: 1, lastConfirmedAt: hAgo(73) }).state === "expired");
check("traffic 4 h → unconfirmed", state({ type: "traffic", status: "slow", reports: 1, lastConfirmedAt: hAgo(4) }).state === "unconfirmed");

// News-only = half
const news = state({ type: "landslide", status: "closed", reports: 0, official: 0, news: 2, lastConfirmedAt: hAgo(40) });
check("news-only closed slide 40 h → expired (36 h life)", news.state === "expired" && news.shelfLifeH === 36);
check("photo + news keeps the full life", state({ type: "landslide", status: "closed", reports: 1, news: 2, lastConfirmedAt: hAgo(40) }).state === "unconfirmed");

// Demo never expires
const demo = state({ ...slide, isDemo: true, lastConfirmedAt: hAgo(24 * 30) });
check("demo event 30 days old → still active, no expiry", demo.state === "active" && demo.expiresAt === null);
// "Pick a spot" (B1): a demo event made by a report placed on the map still expires like a real one
const placedOld = state({ ...slide, isDemo: true, placed: true, lastConfirmedAt: hAgo(24 * 30) });
check("placed-on-map demo event 30 days old → expired", placedOld.state === "expired");

// Promised reopening time passed
const eta = state({ ...slide, lastConfirmedAt: hAgo(6), etaClear: { earliest: hAgo(4), latest: hAgo(2) } });
check("official 'open by' passed → unconfirmed early", eta.state === "unconfirmed" && /reopen/.test(eta.reason ?? ""), eta.reason ?? "");
const etaFuture = state({ ...slide, lastConfirmedAt: hAgo(6), etaClear: { earliest: hAgo(-1), latest: hAgo(-3) } });
check("reopening time still ahead → active", etaFuture.state === "active");

// Closure notice runs to its own end date
const notice = state({ type: "closure_notice", status: "closed", reports: 0, official: 1, lastConfirmedAt: hAgo(100), etaClear: { earliest: hAgo(-10), latest: hAgo(-20) } });
check("closure notice until its end date (100 h old, ends in 20 h) → not expired", notice.state !== "expired", notice.state);

// "Still there?" taps
const iso = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const base = { type: "landslide", status: "one_lane", reports: 1 }; // 48 h shelf life
const yes = (answer: "worse" | "same" | "partly" | "almost_clear", at = 0) => applyTap(undefined, 0.8, answer, "dev1", NOW - at * 3_600_000);
const same = yes("same");
check("Yes · same → confirms, confidence +0.05", same.confirms && Math.abs(same.confidence - 0.85) < 1e-9);
const lifeOf = (answer: "worse" | "same" | "partly" | "almost_clear") =>
  lifecycleOf({ ...base, lastConfirmedAt: iso(0), taps: yes(answer).taps }, NOW).shelfLifeH;
check("worse → 1.5× shelf life (72 h)", lifeOf("worse") === 72);
check("same → full shelf life (48 h)", lifeOf("same") === 48);
check("partly cleared → half (24 h)", lifeOf("partly") === 24);
check("almost clear → quarter (12 h)", lifeOf("almost_clear") === 12);
const later = lifecycleOf({ ...base, lastConfirmedAt: iso(0), taps: yes("partly", 5).taps }, NOW);
check("a newer photo report resets the factor", later.shelfLifeH === 48);
const no1 = applyTap(undefined, 0.8, "gone", "dev1", NOW - 60_000 * 5);
check("No → confidence −0.1, not a confirmation", !no1.confirms && Math.abs(no1.confidence - 0.7) < 1e-9);
const afterNo = lifecycleOf({ ...base, lastConfirmedAt: iso(3), taps: no1.taps }, NOW);
check("1 No → Unconfirmed at once", afterNo.state === "unconfirmed" && /said it's gone/.test(afterNo.reason ?? ""), afterNo.reason ?? "");
const no2 = applyTap(no1.taps, 0.7, "gone", "dev2", NOW - 60_000 * 3);
const no2same = applyTap(no2.taps, 0.6, "gone", "dev2", NOW - 60_000 * 2);
check("same device twice counts once", noWeight(no2same.taps.nos, NOW).devices === 2 && noWeight(no2same.taps.nos, NOW).weight === 2);
const no3 = applyTap(no2.taps, 0.6, "gone", "dev3", NOW - 60_000);
check("3 Nos from 3 devices → weight 3 (closes early)", noWeight(no3.taps.nos, NOW).weight === 3);
const yesAfter = applyTap(no2.taps, 0.6, "same", "dev3", NOW - 60_000);
check("a full Yes cancels earlier Nos", noWeight(yesAfter.taps.nos, NOW).weight === 0);
const almost = applyTap(no2.taps, 0.6, "almost_clear", "dev3", NOW - 60_000);
check("almost clear = ½ No, earlier Nos kept (2.5)", noWeight(almost.taps.nos, NOW).weight === 2.5);
const oldNos = applyTap({ nos: [{ d: "a", at: iso(7), w: 1 }, { d: "b", at: iso(7), w: 1 }] }, 0.6, "gone", "c", NOW);
check("Nos older than 6 h don't count", noWeight(oldNos.taps.nos, NOW).weight === 1);

// Passing traffic (Part C)
check("closed road, drove through at 25 km/h → full 'gone'", passWeight("landslide", "closed", 25) === 1);
check("closed road, crawling at 5 km/h → no signal", passWeight("landslide", "closed", 5) === 0);
check("traffic jam, 45 km/h → full 'gone'", passWeight("traffic", "slow", 45) === 1);
check("traffic jam, 15 km/h → no signal (still jammed)", passWeight("traffic", "slow", 15) === 0);
check("one-lane landslide, 40 km/h → half", passWeight("landslide", "one_lane", 40) === 0.5);
check("one-lane landslide, 20 km/h → no signal (one lane moves too)", passWeight("landslide", "one_lane", 20) === 0);

// Investigator news (Part C)
const doubt = lifecycleOf({ ...base, lastConfirmedAt: iso(3), taps: { doubtAt: iso(1), doubtReason: "Recent news says the road has reopened (AI check)" } }, NOW);
check("news says reopened → Unconfirmed at once, with that reason", doubt.state === "unconfirmed" && /news/.test(doubt.reason ?? ""), doubt.reason ?? "");
const doubtOld = lifecycleOf({ ...base, lastConfirmedAt: iso(1), taps: { doubtAt: iso(3) } }, NOW);
check("a newer photo after the news wins (active again)", doubtOld.state === "active");

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
