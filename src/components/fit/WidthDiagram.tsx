// Code-drawn width diagram (Phase 6C): the measured gap range vs the vehicle (with mirrors) + safety margins.
// All numbers are estimates; the labels say "~".
import type { FitResult } from "@/lib/fit/types";

export default function WidthDiagram({ r }: { r: FitResult }) {
  const W = 320;
  const gap = r.gapM;
  // Leave room on the right for the value labels.
  const span = (Math.max(gap?.max ?? 0, r.neededM) + 0.2) / 0.68;
  const x = (m: number) => 16 + (m / span) * (W - 32);
  const wm = r.widthWithMirrorsM;
  const margin = (r.neededM - wm.max) / 2;
  const tick = (m: number) => `${(Math.round(m * 10) / 10).toFixed(1)} m`;
  return (
    <svg viewBox={`0 0 ${W} 112`} className="w-full" role="img" aria-label={`Gap ${gap ? `${tick(gap.min)} to ${tick(gap.max)}` : "unknown"}; your vehicle needs about ${tick(r.neededM)} including safety margins`}>
      {/* gap: solid to the sure minimum, faded to the maximum */}
      <text x="16" y="14" fontSize="11" fill="#48484A" fontWeight="600">Gap left on the road</text>
      {gap ? (
        <>
          <rect x={x(0)} y="20" width={Math.max(2, x(gap.min) - x(0))} height="18" rx="5" fill="#34C759" fillOpacity="0.55" />
          <rect x={x(gap.min)} y="20" width={Math.max(0, x(gap.max) - x(gap.min))} height="18" rx="5" fill="#34C759" fillOpacity="0.22" />
          <text x={x(gap.max) + 4} y="33" fontSize="11" fill="#1A6B35" fontWeight="700">~{tick(gap.min)}–{tick(gap.max)}</text>
        </>
      ) : (
        <text x="16" y="33" fontSize="12" fill="#6E6E73">not visible in the road photos</text>
      )}
      {/* vehicle with mirrors + margins */}
      <text x="16" y="62" fontSize="11" fill="#48484A" fontWeight="600">Your vehicle + safety margin</text>
      <rect x={x(0)} y="68" width={x(margin) - x(0)} height="18" fill="#FF9F0A" fillOpacity="0.25" />
      <rect x={x(margin)} y="68" width={x(margin + wm.max) - x(margin)} height="18" rx="4" fill="#0071E3" fillOpacity="0.85" />
      <rect x={x(margin + wm.max)} y="68" width={x(r.neededM) - x(margin + wm.max)} height="18" fill="#FF9F0A" fillOpacity="0.25" />
      <text x={x(r.neededM) + 4} y="81" fontSize="11" fill="#0058B0" fontWeight="700">needs ~{tick(r.neededM)}</text>
      <text x="16" y="104" fontSize="10.5" fill="#6E6E73">
        blue = width with mirrors (~{tick(wm.max)}) · orange = {tick(r.safetyM / 2)} each side
      </text>
    </svg>
  );
}
