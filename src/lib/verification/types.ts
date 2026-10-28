// Client-safe: dual-model verification (Phase 5 · Part C). The claim writer (normally Muse Spark Open
// on Baseten) reads the photo; a different model (normally Muse Spark 1.3 on Meta) checks it independently.
export type ModelSource = "baseten" | "meta" | "mock" | "rules" | "none";

/** Stored on the at-location claim's payload (`claims.payload.verification`) and on the timeline item. */
export interface VerificationRecord {
  claimBy: ModelSource;
  verifiedBy: ModelSource;
  verdict: "accept" | "pending" | "reject";
  agrees: boolean;
  /** Two different models looked at the photo (not a fallback to the same one, not rules). */
  twoModels: boolean;
  confidence: number;
  claimed: { status: string; type: string };
  corrected: { status: string | null; type: string | null };
  reasoning: string;
}

export const MODEL_NAME: Record<ModelSource, string> = {
  baseten: "Muse Spark Open",
  meta: "Muse Spark 1.3",
  mock: "test fixture",
  rules: "rule checks",
  none: "no model",
};
export const MODEL_WHERE: Record<ModelSource, string> = {
  baseten: "open weights · Baseten",
  meta: "Meta Model API",
  mock: "",
  rules: "no AI available",
  none: "",
};

/** Per-event roll-up for the event page. */
export interface EventVerification {
  checked: number;
  bothAgreed: number;
  disagreed: number;
  corrected: number;
  singleModel: number;
  latest: (VerificationRecord & { at: string }) | null;
}

/** GET /api/stats/verification — agreement across all reports. */
export interface VerificationStats {
  since: string;
  checked: number;
  twoModels: number;
  agreed: number;
  /** agreed / twoModels, 0..1 (null when no two-model checks yet). */
  agreementRate: number | null;
  corrections: { status: number; type: number };
  verdicts: { accept: number; pending: number; reject: number };
  singleModel: number;
  rulesOnly: number;
  pairs: { claimBy: ModelSource; verifiedBy: ModelSource; count: number; agreed: number }[];
  disagreements: { at: string; claimed: string; corrected: string; reasoning: string }[];
  jobs: { purpose: string; provider: string; calls: number; okRate: number; medianMs: number | null; avgCostUsd: number | null }[];
  includesDemo: boolean;
}
