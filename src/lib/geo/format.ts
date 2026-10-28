// Client-safe formatting for routes (times in IST — the app is about Himachal).
import type { Verdict } from "./routeTypes";

export function duration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
export function clock(iso: string): string {
  return IST.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
}

// Verdict pill colours reuse the status tokens (7.2): word + colour, never colour alone.
export const VERDICT_STYLE: Record<Verdict, { bg: string; ink: string; dot: string }> = {
  go: { bg: "rgba(52,199,89,0.16)", ink: "#1A6B35", dot: "#1E7B45" },
  go_with_care: { bg: "rgba(255,159,10,0.20)", ink: "#8A4300", dot: "#C25E00" },
  delay: { bg: "rgba(255,159,10,0.20)", ink: "#8A4300", dot: "#C25E00" },
  avoid: { bg: "rgba(255,59,48,0.14)", ink: "#A1251C", dot: "#B3261E" },
};
