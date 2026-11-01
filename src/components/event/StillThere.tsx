"use client";
// "Still there?" one-tap check (docs/event-lifecycle.md §2): multiple choice only, max 2 taps,
// big buttons (≥56 px), no typing, no sound. In Drive Watch it hides itself after 20 s.
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { eventTitle, STATUS_STYLE, type EventStatus } from "@/lib/events/types";
import type { Lang } from "@/lib/drive/hazards";

export type TapAnswer = "worse" | "same" | "partly" | "almost_clear" | "gone";

const T = {
  en: {
    q1: "Still there?", yes: "Yes", gone: "No, it's gone", skip: "Didn't see it",
    q2: "How is it now?", worse: "Worse than shown", same: "About the same", partly: "Partly cleared", almost_clear: "Almost clear",
    safety: "Passengers, or only when safely stopped", saving: "Saving…", thanks: "Thanks!",
  },
  hi: {
    q1: "क्या यह अब भी है?", yes: "हाँ", gone: "नहीं, हट गया", skip: "ध्यान नहीं दिया",
    q2: "अब कैसा है?", worse: "दिखाए से ज़्यादा ख़राब", same: "लगभग वैसा ही", partly: "कुछ साफ़ हुआ", almost_clear: "लगभग साफ़",
    safety: "सवारी के लिए, या सुरक्षित रुककर ही", saving: "सेव हो रहा है…", thanks: "धन्यवाद!",
  },
};

const KEY = (id: string) => `pf:tap:${id}`;
const AGAIN_MS = 6 * 3_600_000;

/** Did this device answer for this event in the last 6 h? (The server enforces it too.) */
export function answeredRecently(id: string): boolean {
  try {
    const at = Number(localStorage.getItem(KEY(id)) ?? 0);
    return Date.now() - at < AGAIN_MS;
  } catch {
    return false;
  }
}
function remember(id: string) {
  try {
    localStorage.setItem(KEY(id), String(Date.now()));
  } catch {
    /* private mode */
  }
}

export interface TapEvent {
  id: string;
  type: string;
  status: EventStatus;
  placeName: string | null;
}

export default function StillThere({
  event,
  position,
  lang = "en",
  autoHideS,
  onDone,
}: {
  event: TapEvent;
  /** Where the user is right now (+ speed if known); the server checks ≤2 km and ≤20 km/h. */
  position: () => { lat: number; lng: number; speedKmh: number | null } | null;
  lang?: Lang;
  /** Drive Watch: hide after N seconds if nobody taps. */
  autoHideS?: number;
  onDone: (result: { message: string } | null) => void;
}) {
  const t = T[lang];
  const [step, setStep] = useState<"q1" | "q2" | "saving">("q1");
  const st = STATUS_STYLE[event.status] ?? STATUS_STYLE.unknown;

  useEffect(() => {
    if (!autoHideS || step !== "q1") return;
    const timer = setTimeout(() => onDone(null), autoHideS * 1000);
    return () => clearTimeout(timer);
  }, [autoHideS, step, onDone]);

  async function send(answer: TapAnswer) {
    const at = position();
    if (!at) return onDone({ message: "Location needed to answer" });
    setStep("saving");
    remember(event.id);
    try {
      const res = await fetch(`/api/events/${event.id}/still-there`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, lat: at.lat, lng: at.lng, speedKmh: at.speedKmh }),
      });
      const b = (await res.json()) as { ok: boolean; data?: { message: string } | null; error?: string; degraded?: string };
      onDone({ message: b.data?.message ?? b.error ?? b.degraded ?? t.thanks });
    } catch {
      onDone({ message: "Couldn't save your answer right now" });
    }
  }

  const big = "flex min-h-[56px] w-full items-center justify-center whitespace-nowrap rounded-[14px] px-3 text-[17px] font-semibold";
  return (
    <section role="dialog" aria-label={t.q1} className="glass flex flex-col gap-3 rounded-[20px] p-4 text-ink" lang={lang}>
      <div className="flex items-center gap-[10px]">
        <span className="size-3 shrink-0 rounded-full" style={{ background: st.dot }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {eventTitle(event.type, event.placeName)} · {st.word.toLowerCase()}
        </span>
      </div>

      {step === "q1" && (
        <>
          <span className="text-[22px] font-bold">{t.q1}</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${big} bg-accent text-white`} onClick={() => setStep("q2")}>
              <Check size={18} strokeWidth={2.8} className="mr-1 shrink-0" aria-hidden /> {t.yes}
            </button>
            <button type="button" className={`${big} bg-white/90 text-ink`} onClick={() => send("gone")}>
              <X size={18} strokeWidth={2.8} className="mr-1 shrink-0" aria-hidden /> {t.gone}
            </button>
          </div>
          <button type="button" className="min-h-[44px] text-[15px] font-semibold text-link" onClick={() => onDone(null)}>
            {t.skip}
          </button>
        </>
      )}

      {step === "q2" && (
        <>
          <span className="text-[22px] font-bold">{t.q2}</span>
          <div className="flex flex-col gap-2">
            {(["worse", "same", "partly", "almost_clear"] as const).map((a) => (
              <button key={a} type="button" className={`${big} bg-white/90 text-ink`} onClick={() => send(a)}>
                {t[a]}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "saving" && <span className="py-3 text-center text-[16px] text-ink-2">{t.saving}</span>}

      <span className="text-center text-[12px] text-ink-3">{t.safety}</span>
    </section>
  );
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return Math.hypot(x, (b.lat - a.lat) * r) * 6371;
}

/**
 * Event page: asks "Still there?" only when this phone is within 2 km of the spot. With location already
 * allowed it checks quietly; otherwise a small "Near this spot?" link asks for it. Never for removed events.
 */
export function StillThereNearby({ event, lat, lng, label }: { event: TapEvent; lat: number; lng: number; label?: string }) {
  const [phase, setPhase] = useState<"hidden" | "link" | "ask" | "done">("hidden");
  const [here, setHere] = useState<{ lat: number; lng: number; speedKmh: number | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  const locate = (quiet: boolean) =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const at = { lat: p.coords.latitude, lng: p.coords.longitude, speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : null };
        if (distanceKm(at, { lat, lng }) <= 2) {
          setHere(at);
          setPhase("ask");
        } else if (!quiet) {
          setMsg("You need to be within 2 km of the spot to answer");
          setPhase("done");
        }
      },
      () => !quiet && (setMsg("Allow location to answer"), setPhase("done")),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );

  useEffect(() => {
    try {
      if (localStorage.getItem("pf:lang") === "hi") setLang("hi");
    } catch {
      /* ignore */
    }
    if (answeredRecently(event.id) || !("geolocation" in navigator)) return;
    setPhase("link");
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => s.state === "granted" && locate(true))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per event
  }, [event.id]);

  if (phase === "hidden") return null;
  if (phase === "done")
    return msg ? <div role="status" className="rounded-[16px] bg-white/[0.84] px-[14px] py-3 text-[14px] text-ink-2">{msg}</div> : null;
  if (phase === "link")
    return (
      <button type="button" onClick={() => locate(false)} className="min-h-[44px] shrink-0 rounded-[14px] bg-white/[0.84] px-[14px] text-left text-[15px] font-semibold text-link">
        {label ?? "Near this spot? Tell travellers if it's still there"}
      </button>
    );
  return (
    <StillThere
      event={event}
      lang={lang}
      position={() => here}
      onDone={(r) => {
        setMsg(r?.message ?? null);
        setPhase("done");
      }}
    />
  );
}
