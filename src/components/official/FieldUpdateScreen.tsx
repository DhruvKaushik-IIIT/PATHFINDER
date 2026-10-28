"use client";

// Frame 15 Field update (FieldUpdate.dc.html): tall sheet over the map. Progress photo (required) →
// SAM measures it right away; the AI check line re-evaluates live as the official moves the slider or
// changes the status (pure code, progress.ts). Status segmented, % cleared, fully-open time, machines,
// optional voice note, Post update → event + timeline + Road Watch, then back to the Command Centre.
import { Camera, CircleAlert, CircleCheck, CircleHelp, Loader2, Mic, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import { MAX_SECONDS, startRecording, type Recorder, type WavRecording } from "@/lib/audio/wavRecorder";
import { eventTitle, type EventDetail, type MapEvent } from "@/lib/events/types";
import { shrinkPhoto } from "@/lib/images/shrink";
import { FIELD_STATUS, progressCheck, type FieldStatus, type PhotoMetrics } from "@/lib/official/progress";
import { machinesLabel, type Repair } from "@/lib/repairs/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

interface PhotoCheck {
  now: PhotoMetrics | null;
  before: (PhotoMetrics & { at: string }) | null;
}

const HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });

const CHECK_STYLE = {
  ok: { bg: "rgba(52,199,89,0.14)", ink: "#155A2C", Icon: CircleCheck },
  warn: { bg: "rgba(255,159,10,0.20)", ink: "#8A4300", Icon: CircleAlert },
  unknown: { bg: "rgba(118,118,128,0.12)", ink: "#48484A", Icon: CircleHelp },
};

export default function FieldUpdateScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<Recorder | null>(null);
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [repair, setRepair] = useState<Repair | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [measured, setMeasured] = useState<PhotoCheck | null>(null);
  const [status, setStatus] = useState<FieldStatus>("clearing");
  const [pct, setPct] = useState(50);
  const [openBy, setOpenBy] = useState("");
  const [machines, setMachines] = useState("");
  const [voice, setVoice] = useState<WavRecording | null>(null);
  const [recording, setRecording] = useState(false);
  const [posting, setPosting] = useState(false);

  // Event + crew (prefill from the latest update / assigned crew).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [e, r] = await Promise.all([
          fetch(`/api/events/${eventId}`).then((x) => x.json() as Promise<{ data?: EventDetail | null; error?: string }>),
          fetch(`/api/repairs?ids=${eventId}`).then((x) => x.json() as Promise<{ data?: Repair[] }>).catch(() => ({ data: [] })),
        ]);
        if (!alive) return;
        if (!e.data) return setFailed(e.error ?? "Event not found");
        if (e.data.resolvedAt) return setFailed("This event is already marked fully open.");
        setEv(e.data);
        setStatus(e.data.status === "one_lane" ? "one_lane" : "clearing");
        const rep = r.data?.[0] ?? null;
        setRepair(rep);
        if (rep?.pctCleared != null) setPct(rep.pctCleared);
        if (rep?.machines.length) setMachines(machinesLabel(rep.machines));
        const eta = rep?.fullyOpenAt ?? e.data.etaClear?.latest;
        if (eta && new Date(eta).getTime() > Date.now()) setOpenBy(HHMM.format(new Date(eta)));
      } catch {
        if (alive) setFailed("Couldn't load this event");
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  const placed = useRef(false);
  const place = useCallback(() => {
    if (!ev || placed.current || !mapRef.current) return;
    placed.current = true;
    mapRef.current.jumpTo({ center: [ev.lng, ev.lat], zoom: 12, padding: { top: 0, bottom: Math.max(0, window.innerHeight - 140), left: 0, right: 0 } });
  }, [ev]);
  useEffect(place, [place]);

  async function pickPhoto(file: File) {
    const blob = await shrinkPhoto(file);
    setPhoto(blob);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    setMeasured(null);
    setChecking(true);
    try {
      const form = new FormData();
      form.set("eventId", eventId);
      form.set("photo", blob, "progress.jpg");
      const res = await fetch("/api/official/field/check", { method: "POST", body: form });
      if (res.status === 401) return router.replace("/official/login");
      const j = (await res.json()) as { ok: boolean; data?: PhotoCheck; error?: string; degraded?: string };
      if (!j.ok) {
        setPhoto(null);
        setPreview(null);
        setToast(j.error ?? "Couldn't use this photo");
        return;
      }
      setMeasured(j.data ?? { now: null, before: null });
    } catch {
      setMeasured({ now: null, before: null });
    } finally {
      setChecking(false);
    }
  }

  const check = useMemo(
    () => (measured ? progressCheck({ now: measured.now, before: measured.before, claimedPct: status === "open" ? 100 : pct, status }) : null),
    [measured, pct, status],
  );

  async function toggleVoice() {
    if (recording) {
      const rec = await recorder.current?.stop();
      recorder.current = null;
      setRecording(false);
      if (rec && rec.seconds >= 1) setVoice(rec);
      return;
    }
    try {
      recorder.current = await startRecording();
      setRecording(true);
      setVoice(null);
    } catch {
      setToast("Microphone not available — you can post without a voice note");
    }
  }

  async function post() {
    if (!photo) return;
    setPosting(true);
    try {
      const form = new FormData();
      form.set("eventId", eventId);
      form.set("photo", photo, "progress.jpg");
      form.set("status", status);
      form.set("pctCleared", String(status === "open" ? 100 : pct));
      if (status !== "open" && openBy) form.set("fullyOpenBy", openBy);
      form.set("machines", machines);
      if (voice) form.set("voice", voice.blob, "note.wav");
      const res = await fetch("/api/official/updates", { method: "POST", body: form });
      if (res.status === 401) return router.replace("/official/login");
      const j = (await res.json()) as { ok: boolean; data?: { resolved: boolean; check: { level: string } }; error?: string };
      if (!j.ok || !j.data) throw new Error(j.error);
      router.push(`/official?updated=${j.data.resolved ? "open" : j.data.check.level}`);
    } catch (err) {
      setToast((err as Error).message || "Couldn't post the update — try again");
      setPosting(false);
    }
  }

  const pin: MapEvent[] = ev ? [{ ...ev }] : [];
  const chip = [repair?.org ?? null, repair?.crewName ?? null].filter(Boolean).join(" · ") || "Field update";
  const cs = check ? CHECK_STYLE[check.level] : null;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView mapRef={mapRef} onViewChange={place} showRoadLayer={false} events={pin} initialView={ev ? { latitude: ev.lat, longitude: ev.lng, zoom: 12 } : undefined} />

      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-30">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Field update" initial="full">
        <div className="flex flex-col gap-[14px]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="self-start rounded-[6px] bg-accent-tint px-2 py-1 text-[11px] font-bold uppercase tracking-[0.4px] text-accent-tint-ink">{chip}</span>
              <h1 className="mb-0 mt-1 text-[26px] font-bold tracking-[-0.3px]">Field update</h1>
              <span className="text-[14px] text-ink-2">{ev ? `${eventTitle(ev.type, ev.placeName)}${ev.roadRef ? ` · ${ev.roadRef}` : ""}` : failed ? "" : "Loading…"}</span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => router.push("/official")}
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.14)] text-ink-2"
            >
              <X size={18} strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {failed ? (
            <div className="flex flex-col gap-1 rounded-[16px] bg-white/[0.86] p-[14px]">
              <span className="text-[16px] font-bold">Can’t update this event</span>
              <span className="text-[14px] text-ink-2">{failed}</span>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void pickPhoto(f);
                }}
              />
              {preview ? (
                <button type="button" onClick={() => fileRef.current?.click()} className="relative h-[150px] overflow-hidden rounded-[18px] bg-black/5" aria-label="Retake progress photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img src={preview} alt="Progress photo" className="size-full object-cover" />
                  <span className="glass-dark absolute bottom-2 right-2 rounded-full px-3 py-1 text-[13px] font-semibold">Retake</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-[96px] flex-col items-center justify-center gap-[6px] rounded-[18px] border-[1.5px] border-dashed border-[rgba(60,60,67,0.3)] bg-white/70 text-[15px] font-semibold text-accent-tint-ink"
                >
                  <Camera size={24} strokeWidth={2} aria-hidden />
                  Add progress photo (required)
                </button>
              )}

              <div role="radiogroup" aria-label="Status now" className="flex gap-[3px] rounded-[12px] bg-[rgba(118,118,128,0.14)] p-[3px]">
                {(Object.keys(FIELD_STATUS) as FieldStatus[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={status === k}
                    onClick={() => setStatus(k)}
                    className={`h-[38px] flex-1 rounded-[10px] text-[14px] ${status === k ? "bg-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : ""}`}
                  >
                    {FIELD_STATUS[k].label}
                  </button>
                ))}
              </div>

              <div className="rounded-[16px] bg-white/[0.86] px-[14px] py-1">
                {status !== "open" && (
                  <>
                    <label className="flex flex-col gap-2 border-b-[0.5px] border-[rgba(60,60,67,0.18)] py-3">
                      <span className="flex justify-between text-[15px]">
                        <span>Debris cleared</span>
                        <span className="font-bold">{pct}%</span>
                      </span>
                      <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-accent" />
                    </label>
                    <label className="flex h-[48px] items-center justify-between border-b-[0.5px] border-[rgba(60,60,67,0.18)]">
                      <span className="text-[15px]">Fully open by</span>
                      <input
                        type="time"
                        value={openBy}
                        onChange={(e) => setOpenBy(e.target.value)}
                        className="rounded-[8px] bg-[rgba(118,118,128,0.12)] px-2 py-[6px] text-[15px]"
                      />
                    </label>
                  </>
                )}
                <label className="flex h-[48px] items-center justify-between gap-3">
                  <span className="shrink-0 text-[15px]">Machines on site</span>
                  <input
                    type="text"
                    value={machines}
                    onChange={(e) => setMachines(e.target.value)}
                    placeholder="2 JCB, 1 tipper"
                    maxLength={200}
                    className="min-w-0 flex-1 bg-transparent text-right text-[15px] text-ink-2 outline-none"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={recording}
                className={`flex h-[46px] items-center justify-center gap-2 rounded-[13px] text-[15px] font-semibold ${
                  recording ? "bg-closed-bg text-closed-ink" : "bg-white/[0.86] text-link"
                }`}
              >
                <Mic size={17} strokeWidth={2.2} aria-hidden />
                {recording ? `Stop recording (max ${MAX_SECONDS} s)` : voice ? `Voice note · ${Math.round(voice.seconds)} s — record again` : "Add voice note (Hindi or English)"}
              </button>

              {checking && (
                <div className="flex items-center gap-[10px] rounded-[14px] bg-[rgba(118,118,128,0.12)] px-[14px] py-3 text-[14px] text-ink-2">
                  <Loader2 size={18} className="shrink-0 motion-safe:animate-spin" aria-hidden />
                  SAM 3.1 is measuring the debris in your photo…
                </div>
              )}
              {check && cs && (
                <div role="status" className="flex items-start gap-[10px] rounded-[14px] px-[14px] py-3" style={{ background: cs.bg, color: cs.ink }}>
                  <cs.Icon size={20} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden />
                  <span className="text-[14px] leading-[1.4]">{check.text}</span>
                </div>
              )}

              <button
                type="button"
                onClick={post}
                disabled={!photo || checking || posting || recording}
                className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white disabled:opacity-50"
              >
                {posting ? "Posting…" : "Post update"}
              </button>
              <p className="m-0 text-center text-[12px] leading-[1.4] text-ink-3">
                Faces and number plates are blurred before the photo is public · travellers on this road are re-checked by Road Watch
              </p>
            </>
          )}
        </div>
      </Sheet>
    </main>
  );
}
