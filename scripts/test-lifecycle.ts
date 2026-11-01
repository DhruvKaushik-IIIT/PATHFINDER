// pnpm test:lifecycle — shelf life rules (docs/event-lifecycle.md). No AI, no network.
import { lifecycleOf, shelfLifeH } from "../src/lib/events/lifecycle.ts";

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

// Promised reopening time passed
const eta = state({ ...slide, lastConfirmedAt: hAgo(6), etaClear: { earliest: hAgo(4), latest: hAgo(2) } });
check("official 'open by' passed → unconfirmed early", eta.state === "unconfirmed" && /reopen/.test(eta.reason ?? ""), eta.reason ?? "");
const etaFuture = state({ ...slide, lastConfirmedAt: hAgo(6), etaClear: { earliest: hAgo(-1), latest: hAgo(-3) } });
check("reopening time still ahead → active", etaFuture.state === "active");

// Closure notice runs to its own end date
const notice = state({ type: "closure_notice", status: "closed", reports: 0, official: 1, lastConfirmedAt: hAgo(100), etaClear: { earliest: hAgo(-10), latest: hAgo(-20) } });
check("closure notice until its end date (100 h old, ends in 20 h) → not expired", notice.state !== "expired", notice.state);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
