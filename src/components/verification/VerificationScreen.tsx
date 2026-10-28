"use client";

// "How Pathfinder verifies" (Phase 5 · Part C): the dual-model pipeline + live agreement stats from
// GET /api/stats/verification. Same glass sheet over the map as the other detail screens.
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MODEL_NAME, type VerificationStats } from "@/lib/verification/types";
import { ago } from "@/lib/events/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const STEPS = [
  ["SAM 3.1", "Finds the road, debris, vehicles, faces and number plates; blurs people; measures how much road is blocked."],
  ["Muse Spark Open", "Open-weight model on Baseten. Reads the photo, the measurements and any voice note → a structured report."],
  ["Muse Spark 1.3", "A different model on Meta's API looks at the same photo on its own and accepts, corrects or rejects the report."],
  ["Plain code", "Merges reports on the same road, raises confidence with each independent confirmation, never fakes precision."],
  ["Investigator agent", "When evidence gets old or doubtful, gathers reports, official updates and news, and asks nearby scouts for a photo."],
] as const;

const JOB: Record<string, string> = { write_claim: "Read photo", verify_claim: "Check report" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function VerificationScreen() {
  const router = useRouter();
  const [s, setS] = useState<VerificationStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats/verification")
      .then((r) => r.json() as Promise<{ data?: VerificationStats | null; degraded?: string }>)
      .then((b) => (b.data ? setS(b.data) : setErr(b.degraded ?? "Stats unavailable right now")))
      .catch(() => setErr("Couldn't reach the server — try again"));
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} />
      <section
        aria-label="How Pathfinder verifies"
        className="glass absolute inset-x-0 bottom-0 top-[96px] z-10 mx-auto flex max-w-[480px] flex-col gap-[12px] overflow-y-auto rounded-t-[30px] px-[18px] pb-6 pt-2"
      >
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-[3px]">
            <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">How Pathfinder verifies</h1>
            <span className="text-[14px] text-ink-2">Two Meta models check every photo, then code decides</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.16)] text-ink-2"
          >
            <X size={16} strokeWidth={2.6} aria-hidden />
          </button>
        </div>

        {err && <p className="m-0 text-[14px] text-ink-2">{err}</p>}
        {!s && !err && <span aria-busy className="h-20 animate-pulse rounded-[14px] bg-black/10" />}
        {s && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Tile value={s.agreementRate === null ? "—" : pct(s.agreementRate)} label="Models agree" />
              <Tile value={String(s.checked)} label="Reports checked" />
              <Tile value={String(s.corrections.status + s.corrections.type)} label="Corrections" />
            </div>
            <span className="-mt-1 text-[12px] text-ink-2">
              Last 30 days · {s.twoModels} checked by two different models · {s.verdicts.accept} accepted · {s.verdicts.pending} unconfirmed · {s.verdicts.reject} rejected
              {s.singleModel ? ` · ${s.singleModel} by one model (fallback)` : ""}
              {s.rulesOnly ? ` · ${s.rulesOnly} by rules only` : ""}
              {s.includesDemo ? " · includes demo reports" : ""}
            </span>

            {s.pairs.length > 0 && (
              <div className="flex flex-col rounded-[14px] bg-white/84">
                {s.pairs.map((p, i) => (
                  <div key={`${p.claimBy}-${p.verifiedBy}`} className={`flex items-center gap-2 px-[14px] py-[10px] ${i < s.pairs.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}>
                    <span className="min-w-0 flex-1 text-[14px]">
                      <strong>{MODEL_NAME[p.claimBy]}</strong> wrote · <strong>{MODEL_NAME[p.verifiedBy]}</strong> checked
                    </span>
                    <span className="shrink-0 text-[14px] font-semibold">
                      {p.agreed}/{p.count} agree
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <h2 className="m-0 mt-1 text-[18px] font-bold">The pipeline</h2>
        <ol className="m-0 flex list-none flex-col gap-[10px] rounded-[14px] bg-white/84 px-[14px] py-3">
          {STEPS.map(([name, what], i) => (
            <li key={name} className="flex gap-[10px]">
              <span aria-hidden className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-[12px] font-bold text-accent-tint-ink">
                {i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-[14px] font-semibold">{name}</span>
                <span className="text-[13px] text-ink-2">{what}</span>
              </span>
            </li>
          ))}
        </ol>

        {s && s.disagreements.length > 0 && (
          <>
            <h2 className="m-0 mt-1 text-[18px] font-bold">When the checker disagreed</h2>
            <div className="flex flex-col rounded-[14px] bg-white/84">
              {s.disagreements.map((d, i) => (
                <div key={`${d.at}-${i}`} className={`flex flex-col gap-0.5 px-[14px] py-[10px] ${i < s.disagreements.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}>
                  <span className="text-[14px] font-semibold">
                    {d.claimed} → {d.corrected}
                  </span>
                  {d.reasoning && <span className="text-[13px] text-ink-2">{d.reasoning}</span>}
                  <span className="text-[12px] text-ink-3">{ago(d.at)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {s && s.jobs.length > 0 && (
          <>
            <h2 className="m-0 mt-1 text-[18px] font-bold">Speed and cost</h2>
            <div className="flex flex-col rounded-[14px] bg-white/84">
              {s.jobs.map((j, i) => (
                <div key={`${j.purpose}-${j.provider}`} className={`flex items-center gap-2 px-[14px] py-[10px] ${i < s.jobs.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-semibold">
                      {JOB[j.purpose] ?? j.purpose} · {MODEL_NAME[j.provider as keyof typeof MODEL_NAME] ?? j.provider}
                    </span>
                    <span className="text-[12px] text-ink-2">
                      {j.calls} calls · {pct(j.okRate)} ok
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[13px] text-ink-2">
                    {j.medianMs !== null ? `~${(j.medianMs / 1000).toFixed(1)} s` : "—"}
                    <br />
                    {j.avgCostUsd !== null ? `~$${j.avgCostUsd.toFixed(4)}` : "Baseten credits"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="m-0 text-center text-[12px] text-ink-2">AI estimates can be wrong · verify with official sources</p>
      </section>
    </main>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-px rounded-[14px] bg-white/84 p-3">
      <span className="text-[22px] font-bold">{value}</span>
      <span className="text-[12px] text-ink-2">{label}</span>
    </div>
  );
}
