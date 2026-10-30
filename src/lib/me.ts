// Server-only: who is this traveller? No sign-up for the public (CLAUDE.md 1): each device gets an
// anonymous `users` row on first need, remembered in an httpOnly cookie. Officials sign in (Phase 4).
import { cookies } from "next/headers.js"; // .js so plain-node scripts can import this file too
import { insert, select, update } from "./db/supabase.ts";
import { DISTRICTS, kmBetween } from "./official/districts.ts";

const COOKIE = "pf_uid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The device's user id, or null if it has none yet (reading never creates a row). */
export async function currentUserId(): Promise<string | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  const [row] = await select<{ id: string }>("users", `select=id&id=eq.${id}&limit=1`);
  return row?.id ?? null;
}

/** The device's user id, creating an anonymous public user (and the cookie) if needed. Route handlers only. */
export async function ensureUserId(): Promise<string> {
  const existing = await currentUserId();
  if (existing) return existing;
  const [row] = await insert<{ id: string }>("users", { role: "public" });
  (await cookies()).set(COOKIE, row!.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
  return row!.id;
}

/** District whose circle contains the point (nearest centre wins), or null outside all of them. */
export function districtAt(p: { lat: number; lng: number }): string | null {
  const inside = DISTRICTS.filter((d) => kmBetween(p, d) <= d.radiusKm).sort((a, b) => kmBetween(p, a) - kmBetween(p, b));
  return inside[0]?.name ?? null;
}

/** Add report points to the user's total; the first report also sets their home district (leaderboard). */
export async function creditUser(userId: string, points: number, at: { lat: number; lng: number }): Promise<void> {
  const [u] = await select<{ points: number; district: string | null }>("users", `select=points,district&id=eq.${userId}&limit=1`);
  if (!u) return;
  await update("users", `id=eq.${userId}`, {
    points: Math.max(0, u.points + points),
    ...(!u.district && { district: districtAt(at) }),
  });
}
