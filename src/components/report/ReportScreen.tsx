"use client";

// Frame 10 Report (docs/design/glass-html/Report.dc.html): camera view with dark-glass controls.
// Shutter (or a library photo) → POST /api/reports with GPS + optional WAV voice note → /report/done.
import { Image as ImageIcon, Mic, Navigation, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Toast from "@/components/glass/Toast";
import { shrinkPhoto } from "@/lib/images/shrink";
import { takenAt } from "@/lib/images/takenAt";
import { MAX_SECONDS, startRecording, type Recorder, type WavRecording } from "@/lib/audio/wavRecorder";

import { LAST_REPORT_KEY } from "./storage";

const SLOPE_STEPS = [
  "Blurring faces and number plates",
  "Finding water, rocks and scars with SAM 3.1",
  "Reading the slope · Muse Spark Open",
  "Second look · Muse Spark",
  "Updating the slope site",
];

const STEPS = [
  "Blurring faces and number plates",
  "Measuring the road with SAM 3.1",
  "Writing the report · Muse Spark Open",
  "Second opinion · Muse Spark",
  "Updating the map",
];

type Loc = { lat: number; lng: number };

type Mode = "photo" | "slope";

export default function ReportScreen() {
  const router = useRouter();
  // Phase 6B: "Slope" mode — the hillside above the road (/report?mode=slope[&site=…] from a slope page or scout request).
  const [mode, setMode] = useState<Mode>("photo");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "slope") setMode("slope");
  }, []);
  const steps = mode === "slope" ? SLOPE_STEPS : STEPS;
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locLabel, setLocLabel] = useState("Finding your location…");
  const [locError, setLocError] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voice, setVoice] = useState<WavRecording | null>(null);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Rear camera.
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamera("on");
      })
      .catch(() => setCamera("off"));
    if (!navigator.mediaDevices) setCamera("off");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // Location, then "Near Aut, NH3 (auto)".
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocError(true);
      setLocLabel("Location unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        setLoc(here);
        setLocLabel("Location found (auto)");
        try {
          const r = (await (await fetch(`/api/snap?lat=${here.lat}&lng=${here.lng}`)).json()) as {
            data?: { placeName: string | null; roadRef: string | null };
          };
          const parts = [r.data?.placeName && `Near ${r.data.placeName}`, r.data?.roadRef].filter(Boolean);
          if (parts.length) setLocLabel(`${parts.join(", ")} (auto)`);
        } catch {
          // keep the generic label
        }
      },
      () => {
        // Opened from a slope page (?site=…&lat&lng): the photo can still be placed at that site.
        const q = new URLSearchParams(window.location.search);
        const lat = Number(q.get("lat"));
        const lng = Number(q.get("lng"));
        if (q.get("site") && Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) {
          setLoc({ lat, lng });
          setLocLabel("At the slope from the link");
          return;
        }
        setLocError(true);
        setLocLabel("Turn on location to report");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);

  // Progress steps while the pipeline runs (~15–25 s); purely informative.
  useEffect(() => {
    if (!sending) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(steps.length - 1, s + 1)), 4000);
    return () => clearInterval(t);
  }, [sending, steps.length]);

  useEffect(() => {
    if (!recording) return;
    setRecSeconds(0);
    const t = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function startMic() {
    if (recording || sending) return;
    try {
      recorder.current = await startRecording(setLevel);
      setRecording(true);
    } catch {
      setToast("Microphone unavailable — you can still send the photo");
    }
  }

  async function stopMic() {
    if (!recorder.current) return;
    const rec = await recorder.current.stop();
    recorder.current = null;
    setRecording(false);
    setLevel(0);
    if (rec) setVoice(rec);
    else setToast("Hold the mic while you speak");
  }

  useEffect(() => () => recorder.current?.cancel(), []);

  async function send(photo: Blob, taken: string | null = null) {
    if (!loc) {
      setToast("We need your location to place the report on the road");
      return;
    }
    setSending(true);
    const form = new FormData();
    form.append("photo", photo, "photo.jpg");
    form.append("lat", String(loc.lat));
    form.append("lng", String(loc.lng));
    if (voice) form.append("voice", voice.blob, "note.wav");
    // Answering a scout request (/report?scout=<id> from the Alerts card): bonus points + request fulfilled.
    const scout = new URLSearchParams(window.location.search).get("scout");
    if (scout) form.append("scout", scout);
    if (taken) form.append("takenAt", taken);
    if (mode === "slope") form.append("kind", "slope");
    try {
      const res = await fetch("/api/reports", { method: "POST", body: form });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? "Could not send the report");
      // Same photo as an earlier report: nothing new to show (the API never re-runs AI on it).
      if ((body as { data?: { duplicate?: boolean } }).data?.duplicate) {
        throw new Error("This photo was already reported — take a new one");
      }
      sessionStorage.setItem(LAST_REPORT_KEY, JSON.stringify(body));
      router.push("/report/done");
    } catch (err) {
      setSending(false);
      setToast(err instanceof Error && err.message ? err.message : "Could not send the report, please try again");
    }
  }

  function shoot() {
    const v = videoRef.current;
    if (camera !== "on" || !v || !v.videoWidth) {
      fileRef.current?.click();
      return;
    }
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    v.pause();
    c.toBlob((b) => (b ? send(b) : setToast("Could not capture the photo")), "image/jpeg", 0.9);
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* Camera, or a calm placeholder when it's unavailable (desktop, permission denied). */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" aria-label="Camera preview" />
      {camera === "off" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#3D4245] px-10 text-center text-[15px] text-[#D1D1D6]">
          Camera unavailable — choose a photo from your library instead.
        </div>
      )}

      {/* top: Cancel + location pill */}
      <div className="absolute inset-x-[14px] top-[54px] z-10 mx-auto flex max-w-[480px] items-center justify-between gap-3">
        <Link href="/" className="flex h-10 items-center rounded-[20px] bg-[rgba(40,40,40,0.45)] px-4 text-[16px] font-medium text-white no-underline backdrop-blur-[20px]">
          Cancel
        </Link>
        <span
          className={`flex h-10 min-w-0 items-center gap-1.5 rounded-[20px] px-[14px] text-[14px] font-medium backdrop-blur-[20px] ${
            locError ? "bg-[rgba(179,38,30,0.7)]" : "bg-[rgba(40,40,40,0.45)]"
          }`}
        >
          <Navigation size={13} fill="currentColor" className="shrink-0 rotate-90" aria-hidden />
          <span className="truncate">{locLabel}</span>
        </span>
      </div>

      <p className="absolute inset-x-6 top-[130px] z-10 text-center text-[15px] font-semibold [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
        {mode === "slope" ? "Point the camera at the hillside above the road. Only when safely stopped." : "Fit the whole blockage in the frame"}
      </p>
      {/* viewfinder corners */}
      <div aria-hidden className="pointer-events-none absolute inset-x-10 top-[300px] bottom-[244px] mx-auto max-w-[420px]">
        <span className="absolute left-0 top-0 size-10 rounded-tl-[10px] border-l-[3px] border-t-[3px] border-white" />
        <span className="absolute right-0 top-0 size-10 rounded-tr-[10px] border-r-[3px] border-t-[3px] border-white" />
        <span className="absolute bottom-0 left-0 size-10 rounded-bl-[10px] border-b-[3px] border-l-[3px] border-white" />
        <span className="absolute bottom-0 right-0 size-10 rounded-br-[10px] border-b-[3px] border-r-[3px] border-white" />
      </div>

      {toast && (
        <div className="absolute inset-x-[14px] top-[170px] z-30">
          <Toast dark message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      {/* bottom: dark glass controls */}
      <div className="glass-dark absolute inset-x-[14px] bottom-7 z-10 mx-auto flex max-w-[452px] flex-col items-center gap-4 rounded-[30px] px-[22px] pb-5 pt-4">
        <div className="flex gap-1 rounded-2xl bg-white/12 p-[3px]" role="radiogroup" aria-label="Report mode">
          {/* Video and Drive & Map modes were cut in Phase 5 (cut order). */}
          {(["Video", "Photo", "Slope", "Drive"] as const).map((m) => {
            const live = m === "Photo" || m === "Slope";
            const on = (m === "Photo" && mode === "photo") || (m === "Slope" && mode === "slope");
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={!live}
                onClick={() => (live ? setMode(m === "Slope" ? "slope" : "photo") : setToast(`${m} reports are coming soon — send a photo for now`))}
                className={`h-[30px] rounded-[13px] px-[13px] text-[13px] font-semibold ${on ? "bg-white/90 text-ink" : live ? "text-white" : "text-white/60"}`}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            aria-label={recording ? "Recording — release to stop" : "Hold to record a voice note"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              void startMic();
            }}
            onPointerUp={() => void stopMic()}
            onPointerCancel={() => void stopMic()}
            onContextMenu={(e) => e.preventDefault()}
            disabled={sending}
            className={`relative flex size-[52px] touch-none select-none items-center justify-center rounded-full ${
              recording ? "bg-[#FF3B30]" : voice ? "bg-accent" : "bg-white/16"
            }`}
            style={recording ? { boxShadow: `0 0 0 ${4 + level * 10}px rgba(255,59,48,0.35)` } : undefined}
          >
            <Mic size={22} strokeWidth={2} aria-hidden />
          </button>

          <button
            type="button"
            aria-label="Take photo and send"
            onClick={shoot}
            disabled={sending || recording}
            className="flex size-[76px] items-center justify-center rounded-full border-4 border-white disabled:opacity-50"
          >
            <span className="size-[60px] rounded-full bg-white" />
          </button>

          <button
            type="button"
            aria-label="Choose from library"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            className="flex size-[52px] items-center justify-center rounded-[14px] bg-white/16"
          >
            <ImageIcon size={22} strokeWidth={2} aria-hidden />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              // Library photo: remember when it was taken (time-consistency check on the server).
              if (f) void Promise.all([shrinkPhoto(f), takenAt(f)]).then(([b, t]) => send(b, t));
            }}
          />
        </div>

        {recording ? (
          <span className="text-[13px] font-semibold text-[#FF6B5E]" aria-live="polite">
            Recording… {recSeconds}s / {MAX_SECONDS}s — release to stop
          </span>
        ) : voice ? (
          <span className="flex items-center gap-2 text-[13px] text-[#D1D1D6]">
            Voice note added · {voice.seconds}s
            <button type="button" aria-label="Delete voice note" onClick={() => setVoice(null)} className="-my-3 flex size-11 items-center justify-center">
              <Trash2 size={15} aria-hidden />
            </button>
          </span>
        ) : (
          <span className="text-[13px] text-[#D1D1D6]">Hold the mic for a note in Hindi or English</span>
        )}
      </div>

      {/* sending: what the AI is doing right now */}
      {sending && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 px-6" role="alertdialog" aria-label="Sending report">
          <div className="glass-dark w-full max-w-[360px] rounded-[24px] p-5">
            <p className="text-[17px] font-semibold">{mode === "slope" ? "Checking the slope…" : "Checking your report…"}</p>
            <p className="mt-1 text-[13px] text-[#D1D1D6]">Usually 15–25 seconds. Keep this screen open.</p>
            <ol className="mt-4 flex flex-col gap-2.5">
              {steps.map((s, i) => (
                <li key={s} className={`flex items-center gap-2.5 text-[14px] ${i <= step ? "text-white" : "text-white/40"}`}>
                  <span
                    className={`size-2 shrink-0 rounded-full ${i < step ? "bg-[#5AD39C]" : i === step ? "animate-pulse bg-white" : "bg-white/30"}`}
                  />
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}
