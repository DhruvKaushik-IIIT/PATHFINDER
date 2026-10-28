"use client";

// Frames 06 / 06b Photos (docs/design/glass-html/Photos.dc.html): dark full-screen viewer.
// "AI-annotated" = the overlay drawn by code from SAM masks; "Original" = the same photo with only
// faces/plates blurred (the unblurred original stays in a private bucket and is never shown).
import { ChevronLeft, Share } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { approxRange, clearWindow } from "@/lib/events/format";
import { ago, STATUS_STYLE, type EventDetail } from "@/lib/events/types";

const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const t = (iso: string) => TIME.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
// Light status chip for the dark viewer (design: #FFB766 etc.).
const CHIP: Record<string, string> = { open: "#5AD39C", slow: "#FFB766", one_lane: "#FFB766", closed: "#FF6B5E", unknown: "#D1D1D6" };

export default function PhotosScreen({ id }: { id: string }) {
  const router = useRouter();
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [annotated, setAnnotated] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((r) => r.json())
      .then((b: { data?: EventDetail | null; error?: string }) => (b.data ? setEv(b.data) : setError(b.error ?? "Photos unavailable")))
      .catch(() => setError("Photos unavailable"));
  }, [id]);

  // Arrow keys on desktop.
  useEffect(() => {
    const n = ev?.photos.length ?? 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(n - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ev]);

  async function share() {
    const url = window.location.href.replace(/\/photos$/, "");
    try {
      if (navigator.share) await navigator.share({ title: "Pathfinder road update", url });
      else {
        await navigator.clipboard.writeText(url);
        setNote("Link copied");
      }
    } catch {
      // user cancelled the share sheet
    }
  }

  const photo = ev?.photos[i];
  const src = photo ? (annotated ? (photo.annotatedUrl ?? photo.publicUrl) : photo.publicUrl) : null;
  const st = ev ? (STATUS_STYLE[ev.status] ?? STATUS_STYLE.unknown) : null;
  const blocked = ev?.measurements.blockedPct;
  const clears = ev ? clearWindow(ev.etaClear) : null;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
        <img
          key={src}
          src={src}
          alt={annotated ? "Photo with AI labels for debris, road and vehicles" : "Photo with faces and number plates blurred"}
          className="absolute inset-0 m-auto max-h-full w-full object-contain"
        />
      )}
      {error && <p className="absolute inset-x-0 top-1/2 text-center text-[15px] text-[#D1D1D6]">{error}</p>}
      {ev && !photo && <p className="absolute inset-x-0 top-1/2 text-center text-[15px] text-[#D1D1D6]">No photos for this event yet</p>}

      {/* top: back · 1 of N · share */}
      <div className="absolute inset-x-[14px] top-[54px] z-10 mx-auto flex max-w-[480px] items-center justify-between">
        <button type="button" aria-label="Back" onClick={() => router.back()} className="glass-dark flex size-10 items-center justify-center rounded-full">
          <ChevronLeft size={20} strokeWidth={2.4} aria-hidden />
        </button>
        {ev && ev.photos.length > 0 && (
          <span className="glass-dark flex h-9 items-center rounded-[18px] px-[14px] text-[14px] font-semibold" aria-live="polite">
            {i + 1} of {ev.photos.length}
          </span>
        )}
        <button type="button" aria-label="Share this road update" onClick={share} className="glass-dark flex size-10 items-center justify-center rounded-full">
          <Share size={18} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {/* glass strip: where, when, who, verified, status */}
      {ev && st && photo && (
        <div className="glass-dark absolute inset-x-[14px] top-[112px] z-10 mx-auto flex max-w-[452px] items-center justify-between gap-2 rounded-[18px] px-[14px] py-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{[ev.placeName, ev.roadRef].filter(Boolean).join(" · ")}</span>
            <span className="truncate text-[12px] text-[#E5E5EA]">
              {t(photo.createdAt)} · {photo.source === "official" ? "Official" : photo.source === "scout" ? "Scout" : "Traveller"} · Verified {Math.round(ev.confidence * 100)}%
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-full px-[9px] py-[5px] text-[12px] font-bold text-ink" style={{ background: CHIP[ev.status] ?? CHIP.unknown }}>
            {st.word === "One lane" ? "One lane open" : st.word}
          </span>
        </div>
      )}

      {/* facts line above the panel */}
      {ev && photo && annotated && (
        <div className="absolute inset-x-[14px] bottom-[196px] z-10 mx-auto flex max-w-[452px] justify-between gap-2 text-[12px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          <span>
            {[blocked && `${approxRange(blocked, "%")?.replace(" %", "%")} blocked`, clears && `clears ~${clears}`].filter(Boolean).join(" · ") || `updated ${ago(ev.lastConfirmedAt)}`}
          </span>
          <span>
            {(["bike", "car", "bus"] as const)
              .map((k) => `${k === "bike" ? "Bikes" : k === "car" ? "Cars" : "Buses"} ${ev.passable[k] === true ? "✓" : ev.passable[k] === false ? "✕" : "?"}`)
              .join(" ")}
          </span>
        </div>
      )}

      {note && (
        <div className="glass-dark absolute inset-x-0 top-[190px] z-20 mx-auto w-fit rounded-full px-4 py-2 text-[13px]" role="status">
          {note}
        </div>
      )}

      {/* bottom panel: AI-annotated / Original, thumbnails, privacy note */}
      {ev && ev.photos.length > 0 && (
        <div className="glass-dark absolute inset-x-[14px] bottom-[26px] z-10 mx-auto flex max-w-[452px] flex-col gap-[10px] rounded-[26px] p-3">
          <div className="flex gap-1 rounded-[14px] bg-white/12 p-[3px]" role="radiogroup" aria-label="Photo version">
            {[
              ["AI-annotated", true],
              ["Original", false],
            ].map(([label, val]) => (
              <button
                key={String(label)}
                type="button"
                role="radio"
                aria-checked={annotated === val}
                onClick={() => setAnnotated(val as boolean)}
                className={`h-8 flex-1 rounded-[11px] text-[14px] font-semibold ${annotated === val ? "bg-white/90 text-ink" : "text-white"}`}
              >
                {label as string}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {ev.photos.slice(0, 5).map((p, k) => {
              const more = k === 4 && ev.photos.length > 5;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={more ? `${ev.photos.length - 4} more photos` : `Photo ${k + 1}`}
                  aria-current={k === i}
                  onClick={() => setI(k)}
                  className="relative h-[52px] flex-1 overflow-hidden rounded-[10px] bg-[#6C767C]"
                  style={k === i ? { outline: "2.5px solid #FFFFFF", outlineOffset: "-2.5px" } : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail */}
                  <img src={p.publicUrl ?? ""} alt="" className="size-full object-cover" />
                  {more && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[14px] font-bold">+{ev.photos.length - 4}</span>}
                </button>
              );
            })}
          </div>
          <span className="text-center text-[12px] text-[#D1D1D6]">
            {annotated && photo && !photo.annotatedUrl
              ? "No AI labels for this photo yet."
              : "AI adds labels only, the photo is never altered. Faces and plates blurred."}
          </span>
        </div>
      )}
    </main>
  );
}
