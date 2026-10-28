// Event pin (CLAUDE.md 7.6): status colour, white ring, shadow. A real <button> so it's tappable + labelled.
import { STATUS_STYLE, TYPE_WORD, type MapEvent } from "@/lib/events/types";

export default function EventPin({ event, selected, onClick }: { event: MapEvent; selected?: boolean; onClick?: () => void }) {
  const st = STATUS_STYLE[event.status] ?? STATUS_STYLE.unknown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${TYPE_WORD[event.type] ?? "Road issue"}, ${st.word}${event.placeName ? `, near ${event.placeName}` : ""}`}
      // 44 px touch target around a 22 px dot.
      className="flex size-11 items-center justify-center"
    >
      <span
        className={`block rounded-full border-[3px] border-white transition-transform ${selected ? "size-[30px]" : "size-[22px]"}`}
        style={{ background: st.dot, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
      />
    </button>
  );
}
