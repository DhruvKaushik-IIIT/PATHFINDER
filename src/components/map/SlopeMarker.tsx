// Slope site marker (Phase 6B): risk-purple "mountain" badge, white ring. A real <button>, 44 px target.
import { Mountain } from "lucide-react";
import { SLOPE_STYLE, SLOPE_WORD, type SlopePin } from "@/lib/slope/types";

export default function SlopeMarker({ pin, onClick }: { pin: SlopePin; onClick?: () => void }) {
  const st = SLOPE_STYLE[pin.level];
  const strong = pin.level === "elevated" || pin.level === "high";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Slope warning: ${SLOPE_WORD[pin.level]}${pin.place ? `, near ${pin.place}` : ""}`}
      className="flex size-11 items-center justify-center"
    >
      <span
        className="flex size-[26px] items-center justify-center rounded-full border-[2.5px] border-white"
        style={{ background: strong ? "#7B5CD6" : "#B9A6F2", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
      >
        <Mountain size={14} strokeWidth={2.6} color={strong ? "#FFFFFF" : st.ink} aria-hidden />
      </span>
    </button>
  );
}
