// Server-only: who is this traveller? No sign-up for the public (CLAUDE.md 1): each device gets an
// anonymous `users` row on first need, remembered in an httpOnly cookie. Officials sign in (Phase 4).
import { cookies } from "next/headers";
import { insert, select } from "./db/supabase.ts";

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
