// Client-safe: the field update "AI check" (frame 15). SAM measures the new progress photo; this pure
// function compares it with the event's earliest photo and with what the official entered. Runs in the
// browser (live while the slider moves) and again on the server when the update is posted.
// Rule 7 (CLAUDE.md 6.2): a mismatch is flagged, never silently accepted or silently overwritten.

export type FieldStatus = "clearing" | "one_lane" | "open";

export interface PhotoMetrics {
  /** Share of the carriageway blocked at the worst point (SAM), mid of the range; null if unmeasured. */
  blockedPct: number | null;
  /** Road width left (SAM + reference objects), if measured. */
  roadLeftM: { min: number; max: number } | null;
  /** Share of the image that is slide/rock — a weaker fallback signal. */
  debrisImagePct: number | null;
}

export interface ProgressInput {
  now: PhotoMetrics | null; // null = SAM unavailable
  before: (PhotoMetrics & { at: string }) | null; // the event's earliest measured photo
  claimedPct: number;
  status: FieldStatus;
}

export interface ProgressCheck {
  level: "ok" | "warn" | "unknown";
  text: string;
  /** Debris reduction the photos show since `before`, if comparable. */
  photoDropPct: number | null;
}

const TOLERANCE = 20;

function clockIst(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
}

export function progressCheck({ now, before, claimedPct, status }: ProgressInput): ProgressCheck {
  if (!now) return { level: "unknown", text: "AI check unavailable right now — the update will be marked as not photo-checked.", photoDropPct: null };

  const blocked = now.blockedPct;
  if (status === "open" && blocked !== null && blocked > 35) {
    return { level: "warn", text: `Photo still shows ~${Math.round(blocked)}% of the road blocked. Check before marking it fully open.`, photoDropPct: null };
  }
  if (status === "one_lane" && blocked !== null && blocked >= 90) {
    return { level: "warn", text: "Photo shows the road fully blocked, not one lane open. Check the photo or the status.", photoDropPct: null };
  }

  // Compare with the first photo of this event (same spot, earlier).
  let drop: number | null = null;
  if (before) {
    if (before.blockedPct !== null && blocked !== null && before.blockedPct > 0) drop = (1 - blocked / before.blockedPct) * 100;
    else if (before.debrisImagePct && now.debrisImagePct !== null) drop = (1 - now.debrisImagePct / before.debrisImagePct) * 100;
  }
  if (drop !== null && before) {
    const d = Math.max(0, Math.min(100, Math.round(drop / 5) * 5));
    const since = clockIst(before.at);
    if (Math.abs(d - claimedPct) <= TOLERANCE) {
      return { level: "ok", text: `AI check: photo shows debris down ~${d}% since ${since}. Consistent with ${claimedPct}%.`, photoDropPct: d };
    }
    return {
      level: "warn",
      text: `AI check: photo shows debris down ~${d}% since ${since}, but you entered ${claimedPct}%. Re-check — the update will be flagged.`,
      photoDropPct: d,
    };
  }

  const left = now.roadLeftM ? ` · ~${now.roadLeftM.min.toFixed(0)}–${now.roadLeftM.max.toFixed(0)} m of road left` : "";
  const what = blocked !== null ? `road ~${Math.round(blocked)}% blocked in this photo${left}` : "no road measurement possible in this photo";
  return { level: blocked !== null ? "ok" : "unknown", text: `AI check: ${what}. First progress photo — it becomes the baseline for the next update.`, photoDropPct: null };
}

/** SAM measurements (photos.measurements) → the few numbers the check uses. */
export function metricsOf(m: { blockedPct?: { min: number; max: number } | null; roadWidthLeftM?: { min: number; max: number } | null; debrisImagePct?: number | null } | null): PhotoMetrics | null {
  if (!m) return null;
  return {
    blockedPct: m.blockedPct ? (m.blockedPct.min + m.blockedPct.max) / 2 : null,
    roadLeftM: m.roadWidthLeftM ?? null,
    debrisImagePct: m.debrisImagePct ?? null,
  };
}

export const FIELD_STATUS: Record<FieldStatus, { label: string; event: "closed" | "one_lane" | "open" }> = {
  clearing: { label: "Clearing", event: "closed" },
  one_lane: { label: "One lane", event: "one_lane" },
  open: { label: "Fully open", event: "open" },
};
