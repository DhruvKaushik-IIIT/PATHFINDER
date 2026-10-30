// Phase 6D guards: rate limits (no network) + the daily AI budget cap (reads ai_calls, makes NO AI call).
// Usage: pnpm test:guard
import { _resetLimits, checkLimit, LIMITS } from "../src/lib/guard/rateLimit.ts";

let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
  if (!ok) fail++;
};
const req = (ip: string, uid?: string) =>
  new Request("http://x/api", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, ...(uid && { cookie: `a=1; pf_uid=${uid}` }) } });
const T = Date.UTC(2026, 9, 31, 6, 0, 5);

// per minute
const [perMin, perHour] = LIMITS.report;
let allowed = 0;
for (let i = 0; i < perMin + 2; i++) if (!checkLimit(req("1.1.1.1"), "report", T)) allowed++;
check("per-minute limit", allowed === perMin, `${allowed}/${perMin + 2} allowed in one minute`);
const l = checkLimit(req("1.1.1.1"), "report", T);
check("friendly message + retry", Boolean(l && l.retryAfterS > 0 && l.retryAfterS <= 60 && /try again/.test(l.message)), l?.message ?? "");
check("other IP not affected", checkLimit(req("2.2.2.2"), "report", T) === null, "allowed");
check("other bucket not affected", checkLimit(req("1.1.1.1"), "fit", T) === null, "allowed");
check("next minute allowed again", checkLimit(req("1.1.1.1"), "report", T + 60_000) === null, "allowed");

// per hour across minutes
_resetLimits();
let ok = 0;
for (let i = 0; i < perHour + 3; i++) if (!checkLimit(req("3.3.3.3"), "report", T + i * 61_000)) ok++;
check("per-hour limit", ok === perHour, `${ok}/${perHour + 3} allowed in an hour`);

// per device: a phone hopping IPs (mobile data) still counts
_resetLimits();
const uid = "11111111-2222-4333-8444-555555555555";
let dev = 0;
for (let i = 0; i < perMin + 2; i++) if (!checkLimit(req(`9.9.9.${i}`, uid), "report", T)) dev++;
check("per-device limit across IPs", dev === perMin, `${dev}/${perMin + 2}`);

// budget cap → router last resort, no provider call
process.env.AI_DAILY_CAP_USD = "0.000001";
const { overBudget, budgetStatus } = await import("../src/lib/ai/budget.ts");
const { sayHello } = await import("../src/lib/ai/router.ts");
const msg = await overBudget();
const st = await budgetStatus();
check("cap reached (tiny cap)", Boolean(msg), `spent today ~$${st.spentUsd} ≥ cap $${st.capUsd}`);
const t0 = Date.now();
const r = await sayHello("meta");
check("router skips providers over the cap", r.source === "none" && r.data === null && /budget/.test(r.degraded ?? ""), `${Date.now() - t0} ms · ${r.degraded}`);
process.env.AI_DAILY_CAP_USD = "1000000";
check("under a large cap", (await overBudget()) === null, "null");

console.log(fail ? `\n${fail} FAILED` : "\nall guard checks passed");
process.exit(fail ? 1 : 0);
