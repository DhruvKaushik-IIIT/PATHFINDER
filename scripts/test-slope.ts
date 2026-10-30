// Slope Sentinel plain-code checks (Phase 6B): code caps, decay, fallback matrix, change metrics. No AI, no network.
// Usage: pnpm test:slope
import { applyCaps, codeLevel } from "../src/lib/slope/caps.ts";
import { changeLines, keptSigns, signMetrics } from "../src/lib/slope/metrics.ts";
import type { SlopeObservation } from "../src/lib/slope/types.ts";

let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
  if (!ok) fail++;
};
const H = 3_600_000;
const at = (hAgo: number) => new Date(Date.now() - hAgo * H).toISOString();

// ---- matrix
const m = (o: Parameters<typeof codeLevel>[0]) => codeLevel(o).level;
check("no signs → none", m({ overall: "none", rain: "high", slides90d: 5, growing: true }) === "none", "rain alone never raises a slope with no signs");
check("minor, dry → watch", m({ overall: "minor", rain: "none", slides90d: 0, growing: false }) === "watch", "watch");
check("concerning + rain → elevated", m({ overall: "concerning", rain: "moderate", slides90d: 0, growing: false }) === "elevated", "elevated");
check("concerning + heavy rain + growth → high", m({ overall: "concerning", rain: "high", slides90d: 0, growing: true }) === "high", "high");
check("severe, dry → elevated", m({ overall: "severe", rain: "low", slides90d: 0, growing: false }) === "elevated", "elevated");
check("bumps max +2", m({ overall: "minor", rain: "high", slides90d: 3, growing: true }) === "high", "minor + 3 bumps → high (then caps decide)");

// ---- caps
const c = (x: Partial<Parameters<typeof applyCaps>[0]>) =>
  applyCaps({ proposed: "high", previous: "none", newPhoto: false, qualifyingReadingAgeH: 2, lastPhotoAgeH: 2, ...x });
check("one step without a new photo", c({}).level === "watch", `${c({}).level} · ${c({}).note}`);
check("new photo can jump", c({ newPhoto: true }).level === "high", c({ newPhoto: true }).level);
check("high needs a 2-model reading < 48 h", c({ newPhoto: true, qualifyingReadingAgeH: 60 }).level === "elevated", c({ newPhoto: true, qualifyingReadingAgeH: 60 }).note ?? "");
check("high needs any qualifying reading", c({ newPhoto: true, qualifyingReadingAgeH: null }).level === "elevated", "elevated");
check("decay after 72 h without a photo", c({ previous: "high", lastPhotoAgeH: 80 }).level === "watch", c({ previous: "high", lastPhotoAgeH: 80 }).note ?? "");
check("lower is never capped", applyCaps({ proposed: "watch", previous: "high", newPhoto: false, qualifyingReadingAgeH: null, lastPhotoAgeH: 1 }).level === "watch", "watch");

// ---- metrics + change
const sam = (rock: number, water: number, wallPct: number) => [
  { concept: "rock", ok: true, boxes: Array(3).fill({ left: 0, top: 0, right: 1, bottom: 1 }), areaPct: rock },
  { concept: "water", ok: true, boxes: water ? [{ left: 0, top: 0, right: 1, bottom: 1 }] : [], areaPct: water },
  { concept: "retaining wall", ok: true, boxes: wallPct ? [{ left: 0, top: 0, right: 100, bottom: wallPct }] : [], areaPct: wallPct },
];
const m1 = signMetrics(sam(1, 0, 10), 100, 100);
const m2 = signMetrics(sam(3.2, 0.8, 10), 100, 100);
check("wall is the reference", m1.ref === "retaining wall" && !m1.rough, `rock norm ${m1.concepts.rock!.norm} → ${m2.concepts.rock!.norm}`);
check("no wall → image (rough)", signMetrics(sam(1, 0, 0), 100, 100).rough, "rough");
const obs = (hAgo: number, metrics: ReturnType<typeof signMetrics>, kinds: string[], verdict = "agree"): SlopeObservation => ({
  id: String(hAgo), site_id: "s", report_id: null, photo_id: null, created_at: at(hAgo), sign_metrics: metrics,
  reading: { isSlopePhoto: true, signs: kinds.map((k) => ({ kind: k as never, severity: "moderate", looksFresh: true, aboveRoad: true, note: "" })), overall: "concerning", confidence: 0.8, summary: "", summaryHi: "", reasoning: "", by: "baseten" },
  check: { verdict: verdict as never, correctedOverall: null, disputedSigns: [], confidence: 0.8, reasoning: "", by: "meta", readBy: "baseten", twoModels: true, finalOverall: "concerning" },
});
const lines = changeLines([obs(18, m1, ["tension_crack"]), obs(0, m2, ["tension_crack", "seepage"])]);
check("growth + new sign", lines.some((l) => /Loose-rock area ~3\.2× larger than 18 h ago/.test(l)) && lines.some((l) => /Water seeping: new since 18 h ago/.test(l)), lines.join(" | "));
check("no previous photo → nothing", changeLines([obs(0, m2, ["seepage"])]).length === 0, "[]");
check("photos > 7 days apart aren't compared", changeLines([obs(24 * 8, m1, []), obs(0, m2, ["seepage"])]).length === 0, "[]");
check("rejected photo ignored", changeLines([obs(18, m1, [], "reject"), obs(0, m2, ["seepage"])]).length === 0, "[]");
const disputed = obs(0, m2, ["tension_crack", "seepage"]);
disputed.check!.disputedSigns = ["tension_crack"];
check("disputed signs dropped", keptSigns(disputed).join() === "seepage", keptSigns(disputed).join());

console.log(fail ? `\n${fail} FAILED` : "\nall slope checks passed");
process.exit(fail ? 1 : 0);
