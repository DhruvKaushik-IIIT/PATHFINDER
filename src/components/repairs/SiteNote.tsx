"use client";

// "Note from the site" (Nov 1): the newest voice note from the crew at this spot — who said it, when,
// the words (Hindi as spoken, English translation, toggle) — so travellers hear it from the person on the
// ground. Text only: the recording itself is never made public (the worker's privacy). Hidden when the
// crew hasn't sent a note in the last 12 h.
import { Mic } from "lucide-react";
import { useState } from "react";
import { ago } from "@/lib/events/types";
import type { SiteNoteView } from "@/lib/repairs/types";

export default function SiteNote({ note }: { note: SiteNoteView }) {
  const hindiFirst = note.lang === "hi" || note.lang === "mixed" || (!note.lang && /[ऀ-ॿ]/.test(note.text));
  const hi = note.hi ?? (hindiFirst ? note.text : null);
  const en = note.en ?? (!hindiFirst ? note.text : null);
  const [showHi, setShowHi] = useState(hindiFirst && Boolean(hi));
  const words = showHi ? hi : (en ?? hi ?? note.text);
  const role = note.role ? note.role.charAt(0).toUpperCase() + note.role.slice(1) : null;
  return (
    <section aria-label="Note from the site" className="flex flex-col gap-2 rounded-[16px] bg-white/[0.86] p-[14px]">
      <div className="flex items-center gap-2">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-tint-ink">
          <Mic size={15} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-ink-2">Note from the site · {ago(note.at)}</span>
          <span className="truncate text-[15px] font-semibold">
            {note.by}
            {role || note.crew ? <span className="font-normal text-ink-2"> · {[role, note.crew].filter(Boolean).join(", ")}</span> : null}
          </span>
        </span>
      </div>
      <p lang={showHi ? "hi" : "en"} className="m-0 text-[15px] leading-[1.5]">
        “{words}”
      </p>
      <div className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
        <span>{note.en || note.hi ? "Voice note · transcribed by Muse Voice · translated by Muse Spark" : "Voice note · transcribed by Muse Voice"}</span>
        {hi && en && (
          <button
            type="button"
            lang={showHi ? "en" : "hi"}
            onClick={() => setShowHi((v) => !v)}
            className="-my-3 h-11 shrink-0 px-1 text-[13px] font-semibold text-link"
          >
            {showHi ? "English" : "हिन्दी"}
          </button>
        )}
      </div>
    </section>
  );
}
