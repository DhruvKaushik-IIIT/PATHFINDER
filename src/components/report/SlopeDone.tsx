"use client";

// Frame 10b for a Slope report (Phase 6B): map with a purple ring at the photo, what two models read,
// the slope site it joined, change since the last photo, points. The risk agent runs after this response.
import { Check, Clock, Mountain, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Marker } from "react-map-gl/maplibre";
import Toast from "@/components/glass/Toast";
import type { SlopeSubmitResult } from "@/lib/slope/submit";
import { SIGN_LABEL } from "@/lib/slope/types";
import { MODEL_NAME } from "@/lib/verification/types";
import { Row } from "./ReportDone";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

export type SlopeResult = Omit<SlopeSubmitResult, "degraded" | "timingsMs">;

export default function SlopeDone({
  result: r,
  total,
  degraded,
  onToastClose,
}: {
  result: SlopeResult;
  total: { points: number; verified: number } | null;
  degraded: string | null;
  onToastClose: () => void;
}) {
  const accepted = r.reportStatus === "accepted";
  const rejected = r.reportStatus === "rejected";
  const disputed = new Set(r.check?.disputedSigns ?? []);
  const signs = [...new Set((r.reading?.signs ?? []).filter((s) => !disputed.has(s.kind)).map((s) => SIGN_LABEL[s.kind] ?? s.kind))];
  const checked = r.check && r.reading
    ? r.check.twoModels
      ? `${MODEL_NAME[r.reading.by]} + ${MODEL_NAME[r.check.by]}: ${r.check.verdict === "agree" ? "agree" : r.check.verdict === "downgrade" ? "lowered" : "rejected"} · ${Math.round(r.check.confidence * 100)}%`
      : `${MODEL_NAME[r.check.by]} only · ${r.check.verdict}`
    : "—";
  const hindi = r.transcript && /[ऀ-ॿ]/.test(r.transcript);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView initialView={{ latitude: r.lat - 0.035, longitude: r.lng, zoom: 11 }}>
        <Marker latitude={r.lat} longitude={r.lng} anchor="center" style={{ zIndex: 0 }}>
          <span aria-label="Your slope photo" className="block size-12 rounded-full border-2 border-[rgba(123,92,214,0.6)] bg-[rgba(123,92,214,0.18)]" />
        </Marker>
      </MapView>

      {degraded && (
        <div className="absolute inset-x-[14px] top-[54px] z-20">
          <Toast message={degraded} onClose={onToastClose} />
        </div>
      )}

      <section aria-label="Slope photo sent" className="glass absolute inset-x-0 bottom-0 top-[392px] z-10 mx-auto flex max-w-[480px] flex-col gap-[14px] overflow-y-auto rounded-t-[30px] px-[18px] pb-7 pt-2">
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />
        <div className="flex items-center gap-[14px]">
          <span className={`flex size-12 shrink-0 items-center justify-center rounded-full text-white ${accepted ? "bg-risk" : rejected ? "bg-unknown" : "bg-slow"}`}>
            {accepted ? <Check size={24} strokeWidth={2.8} aria-hidden /> : rejected ? <X size={24} strokeWidth={2.8} aria-hidden /> : <Clock size={22} strokeWidth={2.6} aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[20px] font-bold">{accepted ? "Thanks, slope photo added" : rejected ? "This doesn't look like a slope" : "Thanks, saved for review"}</span>
            <span className="text-[14px] text-ink-2">
              {accepted
                ? `${r.siteAction === "created" ? "New slope site" : `Slope site · ${r.observations} photos`}${r.placeName ? ` near ${r.placeName}` : ""}. Checking rain and slide history now.`
                : rejected
                  ? (r.check?.reasoning ?? "Point the camera at the hillside above the road.")
                  : "We'll add it once the AI can check it"}
            </span>
          </span>
        </div>

        <div className="glass-card px-[14px] py-1">
          <Row label="Warning signs" value={r.reading ? (signs.length ? signs.slice(0, 3).join(", ") : "None clear") : "Not analysed yet"} />
          <Row label="Checked by" value={checked} />
          <Row label="Change" value={r.changes.find((c) => /larger|new since/.test(c)) ?? r.changes[0] ?? (r.siteAction === "created" ? "First photo here" : "No clear change")} last={!r.transcript} />
          {r.transcript && (
            <div className="flex flex-col gap-[3px] pb-3 pt-[10px]">
              <span className="text-[14px] text-ink-2">Your note{hindi ? " (transcribed from Hindi)" : ""}</span>
              <span className="line-clamp-3 text-[14px] italic" lang={hindi ? "hi" : undefined}>
                “{r.transcript}”
              </span>
            </div>
          )}
        </div>

        {r.points > 0 && (
          <div className="flex items-center gap-[10px] rounded-[14px] bg-white/84 px-[14px] py-3">
            <span className="rounded-[9px] bg-accent-tint px-[9px] py-[5px] text-[14px] font-bold text-accent-tint-ink">+{r.points}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px]">
                Scout points{r.points >= 20 ? " · new view of a slope" : ""}
                {r.scoutBonus ? ` · +${r.scoutBonus} for answering a scout request` : ""}
              </span>
              {total && <span className="text-[12px] text-ink-2">{total.points} points · {total.verified} verified</span>}
            </span>
            <Link href="/me" className="shrink-0 text-[14px] font-semibold text-link no-underline">
              Me
            </Link>
          </div>
        )}

        {r.siteId && (
          <Link href={`/slope/${r.siteId}`} className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-[14px] bg-accent-tint text-[16px] font-semibold text-accent-tint-ink no-underline">
            <Mountain size={18} aria-hidden /> See the slope
          </Link>
        )}
        <Link href="/" className="mt-auto flex h-[52px] shrink-0 items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white no-underline">
          Done
        </Link>
      </section>
    </main>
  );
}
