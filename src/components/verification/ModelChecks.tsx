"use client";

// Dual-model verification (Phase 5 · Part C): who read the photo, who checked it, and whether they agreed.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { EventVerification, VerificationRecord } from "@/lib/verification/types";
import { MODEL_NAME, MODEL_WHERE } from "@/lib/verification/types";

const word = (s: string) => s.replace(/_/g, " ");

/** "agrees" / "corrected to closed" / "rejected the report" — the checker's view in a few words. */
export function checkerSays(r: VerificationRecord): string {
  if (r.verdict === "reject") return "rejected the report";
  const fix = [r.corrected.type && word(r.corrected.type), r.corrected.status && word(r.corrected.status)].filter(Boolean).join(" · ");
  if (fix) return `corrected it to ${fix}`;
  if (!r.agrees) return "wasn't convinced — kept as unconfirmed";
  return r.confidence ? `agrees · ${Math.round(r.confidence * 100)}% sure` : "agrees";
}

function Step({ n, model, where, says }: { n: number; model: string; where: string; says: string }) {
  return (
    <li className="flex gap-[10px]">
      <span aria-hidden className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-[12px] font-bold text-accent-tint-ink">
        {n}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[14px] font-semibold">
          {model}
          {where && <span className="font-normal text-ink-2"> · {where}</span>}
        </span>
        <span className="text-[13px] text-ink-2">{says}</span>
      </span>
    </li>
  );
}

export default function ModelChecks({ v }: { v: EventVerification }) {
  const r = v.latest;
  if (!r) return null;
  const twoModelChecks = v.bothAgreed + v.disagreed;
  return (
    <div className="flex flex-col gap-2 border-t-[0.5px] border-[rgba(60,60,67,0.18)] pt-[10px]">
      <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-ink-3">Latest report, checked twice</span>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        <Step n={1} model={MODEL_NAME[r.claimBy]} where={MODEL_WHERE[r.claimBy]} says={`read the photo: ${word(r.claimed.type)} · ${word(r.claimed.status)}`} />
        <Step n={2} model={MODEL_NAME[r.verifiedBy]} where={MODEL_WHERE[r.verifiedBy]} says={`checked it on its own: ${checkerSays(r)}`} />
      </ol>
      <span className="text-[12px] text-ink-2">
        {twoModelChecks > 0
          ? `${v.bothAgreed} of ${twoModelChecks} report${twoModelChecks > 1 ? "s" : ""}: both models agreed`
          : "Checked by one model only (the other was unavailable)"}
        {v.corrected ? ` · ${v.corrected} corrected by the checker` : ""}
        {v.singleModel ? ` · ${v.singleModel} single-model` : ""}
      </span>
      <Link href="/verification" className="flex min-h-[32px] items-center gap-0.5 text-[13px] font-semibold text-link no-underline">
        How Pathfinder verifies <ChevronRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
