// Small glass card for a tapped pin: what, where, status word + colour, freshness, confidence.
import { X } from "lucide-react";
import { ago, STATUS_STYLE, TYPE_WORD, type MapEvent } from "@/lib/events/types";

export default function EventPeek({ event, onClose }: { event: MapEvent; onClose: () => void }) {
  const st = STATUS_STYLE[event.status] ?? STATUS_STYLE.unknown;
  const where = [event.placeName && `Near ${event.placeName}`, event.roadRef].filter(Boolean).join(" · ");
  return (
    <div role="dialog" aria-label="Road event" className="glass flex gap-3 rounded-[16px] p-3 text-ink">
      {event.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, already resized
        <img src={event.photoUrl} alt="" className="size-[76px] shrink-0 rounded-[12px] object-cover" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[15px] font-semibold leading-tight">{TYPE_WORD[event.type] ?? "Road issue"}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="-m-2 flex size-9 shrink-0 items-center justify-center text-ink-3">
            <X size={17} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        {where && <span className="truncate text-[13px] text-ink-2">{where}</span>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          <span className="rounded-full px-2 py-[2px] text-[12px] font-semibold" style={{ background: st.bg, color: st.ink }}>
            {st.word}
          </span>
          <span>{ago(event.lastConfirmedAt)}</span>
          <span>· ~{Math.round(event.confidence * 100)}% sure</span>
          {event.modelsAgreed && event.modelsAgreed >= 2 ? <span>· 2 AI models agree</span> : null}
        </div>
        {/* TODO(phase-2): link to /event/[id] detail */}
        <span className="text-[11px] text-ink-3">Verify with official sources</span>
      </div>
    </div>
  );
}
