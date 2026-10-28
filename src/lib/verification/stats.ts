// Server-only: dual-model agreement, plain code over stored records (no AI).
// New reports carry a full VerificationRecord (claims.payload.verification + the timeline item).
// Older timeline items only have {verdict, verifiedBy, modelsAgreed}: modelsAgreed = 2 meant "two
// different models agreed", so those count as agreed two-model checks; anything else is "not recorded".
import { select } from "../db/supabase.ts";
import type { EventVerification, ModelSource, VerificationRecord, VerificationStats } from "./types.ts";

interface TimelineData {
  reportId?: string;
  verdict?: VerificationRecord["verdict"];
  verifiedBy?: ModelSource;
  modelsAgreed?: number;
  reasoning?: string;
  status?: string;
  type?: string;
  verification?: VerificationRecord;
}

type Dated = VerificationRecord & { at: string; demo: boolean; reportId: string | null };

/** Legacy timeline item → a record, only when it says enough (two models agreed). */
function fromTimeline(d: TimelineData, at: string, demo: boolean): Dated | null {
  if (d.verification) return { ...d.verification, at, demo, reportId: d.reportId ?? null };
  if (!d.verdict || d.modelsAgreed !== 2) return null;
  const other: ModelSource = d.verifiedBy === "meta" ? "baseten" : "meta";
  return {
    claimBy: other,
    verifiedBy: d.verifiedBy ?? "meta",
    verdict: d.verdict,
    agrees: true,
    twoModels: true,
    confidence: 0,
    claimed: { status: d.status ?? "unknown", type: d.type ?? "other" },
    corrected: { status: null, type: null },
    reasoning: d.reasoning ?? "",
    at,
    demo,
    reportId: d.reportId ?? null,
  };
}

/** Dated record → the public shape (drops internal fields). */
function strip(r: Dated): VerificationRecord & { at: string } {
  const { at, claimBy, verifiedBy, verdict, agrees, twoModels, confidence, claimed, corrected, reasoning } = r;
  return { at, claimBy, verifiedBy, verdict, agrees, twoModels, confidence, claimed, corrected, reasoning };
}

function rollUp(records: Dated[]): EventVerification {
  const two = records.filter((r) => r.twoModels);
  const latest = [...records].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  return {
    checked: records.length,
    bothAgreed: two.filter((r) => r.agrees && r.verdict !== "reject").length,
    disagreed: two.filter((r) => !r.agrees || r.verdict === "reject").length,
    corrected: records.filter((r) => r.corrected.status || r.corrected.type).length,
    singleModel: records.filter((r) => !r.twoModels).length,
    latest: latest ? strip(latest) : null,
  };
}

export async function eventVerification(eventId: string): Promise<EventVerification> {
  const rows = await select<{ at: string; data: TimelineData | null; is_demo: boolean }>(
    "event_timeline",
    `select=at,data,is_demo&event_id=eq.${eventId}&kind=eq.report&order=at.desc&limit=100`,
  );
  return rollUp(rows.map((r) => (r.data ? fromTimeline(r.data, r.at, r.is_demo) : null)).filter((x): x is Dated => x !== null));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

export async function verificationStats(days = 30): Promise<VerificationStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [claims, timeline, calls] = await Promise.all([
    // Every checked photo claim, including rejected/pending ones that never reached an event.
    select<{ created_at: string; is_demo: boolean; report_id: string; verification: VerificationRecord | null }>(
      "claims",
      `select=created_at,is_demo,report_id,verification:payload->verification&payload->verification=not.is.null&created_at=gte.${since}&limit=2000`,
    ),
    select<{ at: string; data: TimelineData | null; is_demo: boolean }>("event_timeline", `select=at,data,is_demo&kind=eq.report&at=gte.${since}&limit=2000`),
    select<{ purpose: string; provider: string; ok: boolean; latency_ms: number | null; cost_usd: number | null }>(
      "ai_calls",
      `select=purpose,provider,ok,latency_ms,cost_usd&purpose=in.(write_claim,verify_claim)&at=gte.${since}&limit=5000`,
    ),
  ]);

  const byReport = new Map<string, Dated>();
  for (const c of claims) if (c.verification) byReport.set(c.report_id, { ...c.verification, at: c.created_at, demo: c.is_demo, reportId: c.report_id });
  const legacy: Dated[] = [];
  for (const t of timeline) {
    const r = t.data ? fromTimeline(t.data, t.at, t.is_demo) : null;
    if (!r) continue;
    if (r.reportId && byReport.has(r.reportId)) continue; // already counted from its claim
    if (r.reportId) byReport.set(r.reportId, r);
    else legacy.push(r);
  }
  const all = [...byReport.values(), ...legacy];
  const two = all.filter((r) => r.twoModels);
  const agreed = two.filter((r) => r.agrees && r.verdict !== "reject").length;

  const pairs = new Map<string, VerificationStats["pairs"][number]>();
  for (const r of two) {
    const k = `${r.claimBy}>${r.verifiedBy}`;
    const p = pairs.get(k) ?? { claimBy: r.claimBy, verifiedBy: r.verifiedBy, count: 0, agreed: 0 };
    p.count++;
    if (r.agrees && r.verdict !== "reject") p.agreed++;
    pairs.set(k, p);
  }

  const groups = new Map<string, typeof calls>();
  for (const c of calls) groups.set(`${c.purpose}|${c.provider}`, [...(groups.get(`${c.purpose}|${c.provider}`) ?? []), c]);
  const jobs = [...groups].map(([k, cs]) => {
    const [purpose, provider] = k.split("|") as [string, string];
    const ok = cs.filter((c) => c.ok);
    const costs = ok.map((c) => c.cost_usd).filter((x): x is number => x != null);
    return {
      purpose,
      provider,
      calls: cs.length,
      okRate: cs.length ? ok.length / cs.length : 0,
      medianMs: median(ok.map((c) => c.latency_ms).filter((x): x is number => x != null)),
      avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    };
  });

  return {
    since,
    checked: all.length,
    twoModels: two.length,
    agreed,
    agreementRate: two.length ? agreed / two.length : null,
    corrections: { status: all.filter((r) => r.corrected.status).length, type: all.filter((r) => r.corrected.type).length },
    verdicts: {
      accept: all.filter((r) => r.verdict === "accept").length,
      pending: all.filter((r) => r.verdict === "pending").length,
      reject: all.filter((r) => r.verdict === "reject").length,
    },
    singleModel: all.filter((r) => !r.twoModels && r.verifiedBy !== "rules").length,
    rulesOnly: all.filter((r) => r.verifiedBy === "rules").length,
    pairs: [...pairs.values()].sort((a, b) => b.count - a.count),
    disagreements: all
      .filter((r) => r.twoModels && (!r.agrees || r.corrected.status || r.corrected.type))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5)
      .map((r) => ({
        at: r.at,
        claimed: `${r.claimed.type.replace("_", " ")} · ${r.claimed.status.replace("_", " ")}`,
        corrected: [r.corrected.type?.replace("_", " "), r.corrected.status?.replace("_", " ")].filter(Boolean).join(" · ") || (r.verdict === "reject" ? "rejected" : "kept as pending"),
        reasoning: r.reasoning.slice(0, 220),
      })),
    jobs: jobs.sort((a, b) => a.purpose.localeCompare(b.purpose) || b.calls - a.calls),
    includesDemo: all.some((r) => r.demo),
  };
}
