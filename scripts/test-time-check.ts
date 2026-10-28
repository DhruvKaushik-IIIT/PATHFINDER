// Time-consistency check (Phase 5 stretch), plain code: an old photo never sets the current status, and a
// less certain report minutes after a confirmation doesn't flip it. Uses a throwaway demo event, no AI.
// Usage: pnpm test:time-check
import type { Claim, Verdict } from "../src/lib/ai/schemas.ts";
import { insert, select, update } from "../src/lib/db/supabase.ts";
import { applyToWorldState } from "../src/lib/reports/events.ts";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail++;
};
// Somewhere quiet (no real events nearby), not snapped to a segment → matched by a ~300 m box.
const P = { lat: 31.4123, lng: 76.6123 };
const now = new Date().toISOString();
const [ev] = await insert<{ id: string }>("events", {
  type: "landslide", status: "one_lane", place_name: "Time-check test", ...P, confidence: 0.9,
  started_at: now, last_confirmed_at: now, sources: { reports: 1, official: 0, news: 0, notices: 0 }, is_demo: true,
});
const claim = (status: Claim["status"], confidence: number): Claim => ({
  eventType: "landslide", status, passable: { bike: null, car: null, bus: null },
  measurements: { blockedLengthM: null, roadWidthLeftM: null, blockedPct: null, vehiclesVisible: null },
  crowd: null, atReportLocation: true, placeHint: null, summary: `test says ${status}`, summaryHi: "", confidence, reasoning: "test",
});
const verdict = (confidence: number): Verdict => ({ verdict: "accept", agrees: true, confidence, correctedStatus: null, correctedEventType: null, reasoning: "test" });
const base = { verifiedBy: "meta", modelsAgreed: 2, segmentId: null, placeName: "Time-check test", ...P, reportId: "00000000-0000-0000-0000-000000000000", photoUrl: null };
const status = async () => (await select<{ status: string }>("events", `select=status&id=eq.${ev!.id}`))[0]!.status;

try {
  const flip = await applyToWorldState({ ...base, claim: claim("closed", 0.6), verdict: verdict(0.6) });
  check("less certain flip within 30 min → kept", flip.action === "noted" && (await status()) === "one_lane", flip.timeCheck);

  const old = await applyToWorldState({ ...base, claim: claim("closed", 0.95), verdict: verdict(0.95), photoAgeH: 30 });
  check("30 h old photo → history only", old.action === "noted" && (await status()) === "one_lane", old.timeCheck);

  const sure = await applyToWorldState({ ...base, claim: claim("closed", 0.95), verdict: verdict(0.95) });
  check("more certain fresh report → status changes", sure.action === "merged" && (await status()) === "closed");

  await update("events", `id=eq.${ev!.id}`, { last_confirmed_at: new Date(Date.now() - 45 * 60_000).toISOString(), confidence: 0.95 });
  const later = await applyToWorldState({ ...base, claim: claim("one_lane", 0.6), verdict: verdict(0.6) });
  check("after 30 min a fresh report wins again", later.action === "merged" && (await status()) === "one_lane");

  const lone = await applyToWorldState({ ...base, lat: 31.4923, lng: 76.6923, claim: claim("closed", 0.9), verdict: verdict(0.9), photoAgeH: 50 });
  check("old photo with no event → no new pin", lone.eventId === null && lone.reportStatus === "pending", lone.timeCheck);
} finally {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/events?id=eq.${ev!.id}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
}
process.exit(fail ? 1 : 0);
