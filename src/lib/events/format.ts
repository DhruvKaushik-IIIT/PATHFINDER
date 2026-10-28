// Client-safe formatting for event estimates (CLAUDE.md 6.2: every number "~", never fake precision).
import type { Range } from "./types";

/** "~35 m" when tight, "~30–40 m" when not, null when unknown. */
export function approxRange(r: Range | null | undefined, unit: string): string | null {
  if (!r) return null;
  const mid = (r.min + r.max) / 2;
  const f = (x: number) => (x < 10 ? x.toFixed(1).replace(/\.0$/, "") : String(Math.round(x)));
  return r.max - r.min <= Math.max(1, mid * 0.3) ? `~${f(mid)} ${unit}` : `~${f(r.min)}–${f(r.max)} ${unit}`;
}

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const HOUR = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const hour = (d: Date) =>
  HOUR.format(d)
    .replace(":00", "")
    .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);

/** "1–2 PM" · "11 PM–1 AM" · "Tomorrow 10 AM–4 PM" (IST). */
export function clearWindow(w: { earliest: string; latest: string } | null): string | null {
  if (!w) return null;
  const a = new Date(w.earliest);
  const b = new Date(w.latest);
  const today = DAY.format(new Date());
  const tomorrow = DAY.format(new Date(Date.now() + 86_400_000));
  const prefix = DAY.format(a) === today ? "" : DAY.format(a) === tomorrow ? "Tomorrow " : `${a.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" })} `;
  const ha = hour(a);
  const hb = hour(b);
  // Window across midnight: name the second day too ("6 PM–Fri 6 AM").
  if (DAY.format(a) !== DAY.format(b)) {
    const dayB = DAY.format(b) === tomorrow ? "tomorrow " : `${b.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" })} `;
    return `${prefix}${ha}–${dayB}${hb}`;
  }
  // "1 PM–2 PM" → "1–2 PM"
  const same = ha.slice(-2) === hb.slice(-2);
  return `${prefix}${same ? ha.slice(0, -3) : ha}–${hb}`;
}
