"use client";

// Drive Watch device helpers (Phase 6A): screen wake lock (+ NoSleep-style video fallback),
// spoken alerts (Web Speech API) and the app language setting.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/drive/hazards";

const LANG_KEY = "pf:lang";

/** App language (EN/HI), kept on this device. Defaults to the phone's language. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "hi") return setLang(saved);
    } catch {}
    if (navigator.language?.toLowerCase().startsWith("hi")) setLang("hi");
  }, []);
  const set = useCallback((l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  }, []);
  return [lang, set];
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } };

/**
 * Keep the screen on while driving. `start()` must run inside a tap (iOS). Re-acquires the lock when
 * the page becomes visible again; without the Wake Lock API it plays a hidden muted looping video.
 */
export function useWakeLock(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [mode, setMode] = useState<"off" | "lock" | "video" | "none">("off");
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const active = useRef(false);

  const acquire = useCallback(async () => {
    const nav = navigator as WakeLockNav;
    if (nav.wakeLock) {
      try {
        sentinel.current = await nav.wakeLock.request("screen");
        setMode("lock");
        return;
      } catch {
        // denied (battery saver, not visible) → try the video
      }
    }
    try {
      await videoRef.current?.play();
      setMode(videoRef.current ? "video" : "none");
    } catch {
      setMode("none");
    }
  }, [videoRef]);

  const start = useCallback(() => {
    active.current = true;
    void acquire();
  }, [acquire]);

  const stop = useCallback(() => {
    active.current = false;
    void sentinel.current?.release().catch(() => {});
    sentinel.current = null;
    videoRef.current?.pause();
    setMode("off");
  }, [videoRef]);

  useEffect(() => {
    // The browser drops the lock whenever the page is hidden (e.g. switching to Google Maps).
    const onVis = () => {
      if (active.current && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void sentinel.current?.release().catch(() => {});
    };
  }, [acquire]);

  return { mode, start, stop };
}

function voiceFor(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const by = (p: string) => voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(p));
  return lang === "hi" ? (by("hi") ?? null) : (by("en-in") ?? by("en") ?? null);
}

/** Can this device speak Hindi? (voices load async on some browsers) */
export function hasHindiVoice(): boolean {
  return typeof window !== "undefined" && Boolean(voiceFor("hi"));
}

/** Queue a spoken alert. Returns false when speech isn't available (the banner still shows). */
export function speak(text: string, lang: Lang): boolean {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return false;
  const u = new SpeechSynthesisUtterance(text);
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.lang = v?.lang ?? (lang === "hi" ? "hi-IN" : "en-IN");
  u.rate = 1;
  synth.speak(u);
  return true;
}
