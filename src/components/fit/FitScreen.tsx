"use client";

// "Can my vehicle cross?" (Phase 6C), frame-05 layout: tall glass sheet over the map centred on the event.
// Step 1 your vehicle (photo / list / saved) → step 2 checking (step list, like /report) → step 3 the report:
// verdict pill + headline, width diagram, factors, advice EN/HI, evidence, "Checked by …", save my vehicle.
// The verdict is code maths (spec table × measured gap); the two models can only lower it.
import { Camera, Check, ChevronLeft, CircleHelp, ImageIcon, ShieldCheck, TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Toast from "@/components/glass/Toast";
import type { FitReport, Identified } from "@/lib/fit/check";
import { clearWindow } from "@/lib/events/format";
import { ago, type EventDetail } from "@/lib/events/types";
import { loadSavedVehicle, saveVehicle, type SavedVehicle } from "@/lib/fit/saved";
import { FIT_STYLE } from "@/lib/fit/types";
import { CATEGORIES, VEHICLES, vehicleById, categoryById, vehicleName } from "@/lib/fit/vehicles";
import { shrinkPhoto } from "@/lib/images/shrink";
import { eventTitle } from "@/components/route/routeData";
import { MODEL_NAME, MODEL_WHERE } from "@/lib/verification/types";
import WidthDiagram from "./WidthDiagram";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

type Stage = "choose" | "checking" | "confirm" | "report";
const STEPS_PHOTO = ["Blurring the number plate", "Identifying your vehicle", "Reading the latest road photos", "Measuring the gap", "Second model checking"];
const STEPS_PICK = ["Reading the latest road photos", "Measuring the gap", "Second model checking"];
const FACTOR_WORD: Record<string, string> = {
  width: "Width", ground_clearance: "Ground clearance", surface: "Surface", edge_drop: "Valley-side edge",
  overhead: "Overhead / roof load", length_turning: "Length & turning", water: "Water", other: "Other",
};
const FACTOR_TONE: Record<string, { c: string; w: string }> = {
  ok: { c: "#1E7B45", w: "OK" }, caution: { c: "#C25E00", w: "Caution" }, problem: { c: "#B3261E", w: "Problem" }, unknown: { c: "#8E8E93", w: "Unclear" },
};

export default function FitScreen({ id }: { id: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [steps, setSteps] = useState(STEPS_PICK);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<SavedVehicle | null>(null);
  const [pick, setPick] = useState("");
  const [roofLoad, setRoofLoad] = useState(false);
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [report, setReport] = useState<FitReport | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hi, setHi] = useState(false);
  const [savedNow, setSavedNow] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((r) => r.json() as Promise<{ data?: EventDetail | null }>)
      .then((b) => b.data && setEv(b.data))
      .catch(() => {});
    const s = loadSavedVehicle();
    setSaved(s);
    if (s) {
      setPick(s.vehicleId ? `v:${s.vehicleId}` : `c:${s.category}`);
      setRoofLoad(s.roofLoad);
    }
  }, [id]);

  useEffect(() => {
    if (stage !== "checking") return;
    setStep(0);
    const t = setInterval(() => setStep((x) => Math.min(steps.length - 1, x + 1)), 3000);
    return () => clearInterval(t);
  }, [stage, steps.length]);

  async function run(body: FormData | { vehicleId?: string; category?: string; roofLoad: boolean }) {
    setSteps(body instanceof FormData && body.get("vehicle") ? STEPS_PHOTO : STEPS_PICK);
    setStage("checking");
    try {
      const res = await fetch(`/api/events/${id}/fit`, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const b = (await res.json()) as { ok: boolean; error?: string; degraded?: string; data?: { stage: "confirm"; identified: Identified | null; reason: string } | { stage: "report"; report: FitReport } };
      if (!b.ok || !b.data) throw new Error(b.error ?? "The check couldn't run right now");
      if (b.data.stage === "confirm") {
        setIdentified(b.data.identified);
        setReason(b.data.reason);
        if (b.data.identified?.matchedVehicleId) setPick(`v:${b.data.identified.matchedVehicleId}`);
        else if (b.data.identified?.category) setPick(`c:${b.data.identified.category}`);
        if (b.data.identified?.roofLoad) setRoofLoad(true);
        setStage("confirm");
      } else {
        setReport(b.data.report);
        setSavedNow(false);
        setStage("report");
        if (b.degraded && /unavailable|only/.test(b.degraded)) setToast(b.degraded.split("; ").find((d) => /unavailable|only/.test(d)) ?? null);
      }
    } catch (err) {
      setStage("choose");
      setToast(err instanceof Error ? err.message : "The check couldn't run right now");
    }
  }

  const selBody = () => (pick.startsWith("v:") ? { vehicleId: pick.slice(2), roofLoad } : { category: pick.slice(2), roofLoad });
  const pickedName = pick.startsWith("v:") ? (vehicleById(pick.slice(2)) ? vehicleName(vehicleById(pick.slice(2))!) : "") : (categoryById(pick.slice(2))?.label ?? "");

  async function onPhoto(f: File) {
    const form = new FormData();
    form.append("vehicle", await shrinkPhoto(f), "vehicle.jpg");
    if (roofLoad) form.append("roofLoad", "1");
    await run(form);
  }

  function save() {
    if (!report) return;
    const v: SavedVehicle = { vehicleId: report.vehicle.vehicleId, category: report.vehicle.category, roofLoad: report.vehicle.roofLoad, name: report.vehicle.name };
    if (saveVehicle(v)) {
      setSaved(v);
      setSavedNow(true);
    } else setToast("Couldn't save on this device");
  }

  const close = () => (window.history.length > 1 ? router.back() : router.push(`/event/${id}`));
  const st = report ? FIT_STYLE[report.verdict] : null;
  const oneLane = report?.oneLaneAround ? clearWindow(report.oneLaneAround) : null;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        events={ev ? [ev] : []}
        selectedEventId={ev?.id ?? null}
        initialView={ev ? { latitude: ev.lat - 0.2, longitude: ev.lng, zoom: 10 } : undefined}
        showRoadLayer={false}
        key={ev ? "ready" : "loading"}
      />
      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-20 mx-auto max-w-[452px]">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <section aria-label="Can my vehicle cross?" className="glass absolute inset-x-0 bottom-0 top-[112px] z-10 mx-auto flex max-w-[480px] flex-col gap-[14px] overflow-y-auto rounded-t-[30px] px-[18px] pb-6 pt-2">
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />
        <div className="flex items-start justify-between gap-[10px]">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">Can my vehicle cross?</h1>
            <span className="text-[14px] text-ink-2">{ev ? [eventTitle(ev.type, ev.placeName), ev.roadRef].filter(Boolean).join(" · ") : "Loading the road…"}</span>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.16)] text-ink-2">
            <X size={16} strokeWidth={2.6} aria-hidden />
          </button>
        </div>

        {(stage === "choose" || stage === "confirm") && (
          <>
            {stage === "confirm" && (
              <div className="glass-card flex items-start gap-[10px] px-[14px] py-3">
                <CircleHelp size={20} className="mt-px shrink-0 text-slow" aria-hidden />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">
                    {identified?.matchedVehicleId ? `Is this a ${vehicleName(vehicleById(identified.matchedVehicleId)!)}?` : identified?.make ? `Looks like a ${[identified.make, identified.model].filter(Boolean).join(" ")}` : "Which vehicle is it?"}
                  </span>
                  <span className="text-[13px] text-ink-2">
                    {reason}
                    {identified && identified.isVehicle ? ` (${Math.round(identified.confidence * 100)}% sure)` : ""}
                  </span>
                </span>
              </div>
            )}

            {stage === "choose" && (
              <>
                <span className="px-1 text-[13px] font-bold uppercase tracking-[0.4px] text-ink-2">Step 1 · Your vehicle</span>
                {saved && (
                  <button type="button" onClick={() => void run({ ...(saved.vehicleId ? { vehicleId: saved.vehicleId } : { category: saved.category ?? "suv" }), roofLoad: saved.roofLoad })} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white">
                    <Check size={18} aria-hidden /> Use my {saved.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold ${saved ? "bg-accent-tint text-accent-tint-ink" : "bg-accent text-white"}`}
                >
                  <Camera size={18} aria-hidden /> Take or upload a photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onPhoto(f);
                  }}
                />
                <p className="m-0 px-1 text-[12px] text-ink-2">The plate is blurred before any AI sees it. The photo is used for this check only and never stored.</p>
                <span className="px-1 text-center text-[13px] text-ink-3">or pick it</span>
              </>
            )}

            <label className="glass-card flex flex-col gap-1.5 px-[14px] py-3">
              <span className="text-[13px] text-ink-2">Vehicle</span>
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-h-[44px] rounded-[10px] bg-white/80 px-2 text-[16px] text-ink">
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <optgroup key={c.id} label={c.label}>
                    {VEHICLES.filter((v) => v.category === c.id).map((v) => (
                      <option key={v.id} value={`v:${v.id}`}>
                        {vehicleName(v)}
                      </option>
                    ))}
                    <option value={`c:${c.id}`}>Other {c.label.toLowerCase()} (typical size)</option>
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="glass-card flex min-h-[52px] items-center justify-between gap-3 px-[14px] py-2">
              <span className="text-[15px]">Luggage or carrier on the roof</span>
              <input type="checkbox" role="switch" checked={roofLoad} onChange={(e) => setRoofLoad(e.target.checked)} className="size-6 accent-[#0071E3]" />
            </label>
            <button
              type="button"
              disabled={!pick}
              onClick={() => void run(selBody())}
              className="flex min-h-[52px] items-center justify-center rounded-[14px] bg-accent text-[16px] font-semibold text-white disabled:opacity-50"
            >
              {stage === "confirm" ? `Yes, check my ${pickedName || "vehicle"}` : pick ? `Check my ${pickedName}` : "Check"}
            </button>
          </>
        )}

        {stage === "checking" && (
          <div className="glass-card flex flex-col gap-3 px-4 py-4" role="status" aria-live="polite">
            <span className="text-[17px] font-semibold">Checking…</span>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {steps.map((s, i) => (
                <li key={s} className={`flex items-center gap-2.5 text-[14px] ${i <= step ? "text-ink" : "text-ink-3"}`}>
                  <span className={`size-2 shrink-0 rounded-full ${i < step ? "bg-open" : i === step ? "animate-pulse bg-accent" : "bg-black/15"}`} />
                  {s}
                </li>
              ))}
            </ol>
            <span className="text-[12px] text-ink-2">Usually 10–20 seconds.</span>
          </div>
        )}

        {stage === "report" && report && st && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="flex h-9 w-fit items-center gap-2 rounded-full px-4 text-[17px] font-bold" style={{ background: st.bg, color: st.ink }}>
                {report.verdict === "fits" ? <Check size={18} strokeWidth={3} aria-hidden /> : report.verdict === "unknown" ? <CircleHelp size={18} aria-hidden /> : report.verdict === "tight" ? <TriangleAlert size={17} aria-hidden /> : <X size={18} strokeWidth={3} aria-hidden />}
                {st.word}
              </span>
              <span className="text-[17px] font-semibold leading-snug">{report.code.headline}</span>
              {[...report.code.caps, report.loweredBy && `Lowered by AI: ${report.loweredBy}`].filter(Boolean).map((c) => (
                <span key={c as string} className="text-[13px] text-ink-2">
                  · {c}
                </span>
              ))}
            </div>

            <div className="glass-card px-[14px] py-3">
              <WidthDiagram r={report.code} />
              <span className="mt-1 block text-[12px] text-ink-3">
                {report.vehicle.source === "spec" ? "Width from the manufacturer spec" : "Typical width for this vehicle type"} · mirrors estimated (not published by makers)
                {report.code.foldMirrorsHelps ? " · folding the mirrors gives you the margin" : ""}
              </span>
            </div>

            {report.assessment && (
              <ul className="glass-card m-0 flex list-none flex-col p-0 px-[14px] py-1" aria-label="What the photos show">
                {report.assessment.factors.map((f, i, arr) => {
                  const tone = FACTOR_TONE[f.verdict] ?? FACTOR_TONE.unknown!;
                  return (
                    <li key={`${f.kind}-${i}`} className={`flex flex-col gap-0.5 py-[10px] ${i < arr.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}>
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        <span className="size-2 rounded-full" style={{ background: tone.c }} />
                        {FACTOR_WORD[f.kind] ?? f.kind}
                        <span className="text-[12px] font-bold" style={{ color: tone.c }}>
                          {tone.w}
                        </span>
                      </span>
                      <span className="text-[13px] text-ink-2">{f.detail}</span>
                    </li>
                  );
                })}
                {report.code.lengthNote && <li className="py-[10px] text-[13px] text-ink-2">{report.code.lengthNote}</li>}
              </ul>
            )}

            {report.assessment && (
              <div className="flex flex-col gap-1.5 rounded-[16px] bg-accent-tint px-[14px] py-3">
                <span className="flex items-center justify-between">
                  <span className="text-[13px] font-bold uppercase tracking-[0.4px] text-accent-tint-ink">What to do</span>
                  <button type="button" onClick={() => setHi((x) => !x)} aria-pressed={hi} className="min-h-[32px] text-[13px] font-semibold text-link">
                    {hi ? "English" : "हिन्दी में पढ़ें"}
                  </button>
                </span>
                <span className="text-[15px] leading-snug text-ink" lang={hi ? "hi" : undefined}>
                  {hi ? report.assessment.overallAdviceHi : report.assessment.overallAdvice}
                </span>
                {oneLane && <span className="text-[13px] text-ink-2">Reopening predictor: one lane ~{oneLane} (estimate)</span>}
              </div>
            )}

            <div className="glass-card flex flex-col gap-2 px-[14px] py-3">
              <span className="flex items-center gap-2 text-[15px] font-semibold">
                <ImageIcon size={17} className="text-ink-3" aria-hidden /> Road evidence
              </span>
              {report.evidence.photos.length ? (
                <div className="flex gap-2">
                  {report.evidence.photos.map((p) => (
                    <Link key={p.url} href={`/event/${report.eventId}/photos`} className="relative h-[72px] flex-1 overflow-hidden rounded-[10px] bg-[#3D4245]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
                      <img src={p.url} alt="Road photo used for this check" loading="lazy" decoding="async" className="size-full object-cover" />
                      <span className="absolute bottom-1 left-1 rounded-[6px] bg-black/55 px-1.5 py-px text-[11px] font-semibold text-white">{p.ageH < 1 ? "<1 h" : `${Math.round(p.ageH)} h`} old</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-ink-2">No road photo yet — the verdict uses the reported numbers only.</span>
              )}
              <span className="text-[12px] text-ink-2">
                {report.evidence.reports} report{report.evidence.reports === 1 ? "" : "s"}
                {report.evidence.official ? ` · official update ${ago(report.evidence.official.at)}${report.evidence.official.pct != null ? ` (${report.evidence.official.pct}% cleared)` : ""}` : ""}
              </span>
            </div>

            {report.assessment && (
              <div className="glass-card flex items-start gap-[10px] px-[14px] py-3">
                <ShieldCheck size={20} className={`mt-px shrink-0 ${report.twoModels ? "text-open" : "text-ink-3"}`} aria-hidden />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] font-semibold">
                    {report.twoModels ? (report.check?.verdict === "agree" ? "2 AI models agree" : "Checked by 2 AI models") : "Checked by 1 AI model"}
                  </span>
                  <span className="text-[13px] text-ink-2">
                    <b className="text-ink">1 {MODEL_NAME[report.assessment.by]}</b> · {MODEL_WHERE[report.assessment.by]} — compared the photos: {FIT_STYLE[report.assessment.suggestedVerdict].word.toLowerCase()} · {Math.round(report.assessment.confidence * 100)}%
                  </span>
                  {report.check && (
                    <span className="text-[13px] text-ink-2">
                      <b className="text-ink">2 {MODEL_NAME[report.check.by]}</b> · {MODEL_WHERE[report.check.by]} — {report.check.verdict === "agree" ? "agrees" : `${report.check.verdict}s: ${FIT_STYLE[report.check.suggestedVerdict].word.toLowerCase()}`} · {report.check.reasoning}
                    </span>
                  )}
                  <span className="text-[12px] text-ink-3">The models can only lower the code&rsquo;s verdict, never raise it.</span>
                </span>
              </div>
            )}

            {saved?.vehicleId === report.vehicle.vehicleId && saved?.category === report.vehicle.category && saved.roofLoad === report.vehicle.roofLoad ? (
              <span className="text-center text-[13px] text-ink-2">{savedNow ? "Saved on this phone — route rows now show if it fits." : `Your saved vehicle: ${saved.name}`}</span>
            ) : (
              <button type="button" onClick={save} className="flex min-h-[48px] items-center justify-center rounded-[14px] bg-accent text-[16px] font-semibold text-white">
                Save my vehicle
              </button>
            )}
            <button type="button" onClick={() => setStage("choose")} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[14px] bg-accent-tint text-[15px] font-semibold text-accent-tint-ink">
              <ChevronLeft size={16} aria-hidden /> Check another vehicle
            </button>
          </>
        )}
        <p className="mt-auto text-center text-[12px] text-ink-2">An estimate from photos. Follow police / PWD instructions on site.</p>
      </section>
    </main>
  );
}
