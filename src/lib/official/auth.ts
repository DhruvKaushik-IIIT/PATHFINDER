// Server-only: sign-in for officials and road crews (CLAUDE.md 7.5 frame 13). Invite-only: an account
// is a Supabase Auth user (created by scripts/create-official.ts with the service role) PLUS a `users`
// row with role official/crew/admin linked by auth_user_id. Signing up through Supabase alone gives no
// access — the role check below is the gate. Plain fetch to Supabase Auth (GoTrue), no SDK.
// Tokens live in httpOnly cookies; the browser never sees them.
import { cookies } from "next/headers";
import { select, supabaseUrl } from "../db/supabase.ts";
import { deptEmail } from "./dept.ts";
import { districtOf, type District } from "./districts.ts";

const ACCESS = "pf_off";
const REFRESH = "pf_off_r";
const STAFF = new Set(["official", "crew", "admin"]);

export interface Official {
  userId: string;
  name: string;
  role: "official" | "crew" | "admin";
  org: string;
  district: District;
}

function authBase(): string {
  const url = supabaseUrl();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  return `${url}/auth/v1`;
}

function anonKey(): string {
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!k) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  return k;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

async function token(grant: "password" | "refresh_token", body: object): Promise<TokenResponse | null> {
  const res = await fetch(`${authBase()}/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: anonKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401) return null; // wrong password / expired refresh token
  if (!res.ok) throw new Error(`auth ${grant}: HTTP ${res.status}`);
  return (await res.json()) as TokenResponse;
}

async function authUserId(accessToken: string): Promise<string | null> {
  const res = await fetch(`${authBase()}/user`, {
    headers: { apikey: anonKey(), Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`auth user: HTTP ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

async function staffRow(authId: string): Promise<Official | null> {
  const [u] = await select<{ id: string; display_name: string | null; role: string; org: string | null; district: string | null }>(
    "users",
    `select=id,display_name,role,org,district&auth_user_id=eq.${authId}&limit=1`,
  );
  if (!u || !STAFF.has(u.role)) return null;
  return {
    userId: u.id,
    name: u.display_name ?? u.org ?? "Official",
    role: u.role as Official["role"],
    org: u.org ?? "Official",
    district: districtOf(u.district),
  };
}

async function setTokens(t: TokenResponse): Promise<void> {
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set(ACCESS, t.access_token, { ...opts, maxAge: t.expires_in });
  jar.set(REFRESH, t.refresh_token, { ...opts, maxAge: 7 * 24 * 3600 });
}

/** Route handlers only. Returns the official, or a reason the UI can show. */
export async function signIn(deptId: string, password: string): Promise<{ ok: true; official: Official } | { ok: false; reason: string }> {
  const t = await token("password", { email: deptEmail(deptId), password });
  if (!t) return { ok: false, reason: "Department ID or password is wrong." };
  const official = await staffRow(t.user.id);
  if (!official) return { ok: false, reason: "This account has no Command Centre access. Ask your district admin." };
  await setTokens(t);
  return { ok: true, official };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value;
  if (access) {
    await fetch(`${authBase()}/logout`, { method: "POST", headers: { apikey: anonKey(), Authorization: `Bearer ${access}` } }).catch(() => {});
  }
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

/** Cheap check for pages (no network): is there a session cookie at all? APIs do the real check. */
export async function hasSession(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(ACCESS)?.value || jar.get(REFRESH)?.value);
}

/**
 * The signed-in official, or null. Route handlers only: an expired access token is refreshed
 * (which rewrites the cookies). Never throws for a bad/expired session.
 */
export async function currentOfficial(): Promise<Official | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value;
  if (access) {
    const id = await authUserId(access);
    if (id) return staffRow(id);
  }
  const refresh = jar.get(REFRESH)?.value;
  if (!refresh) return null;
  const t = await token("refresh_token", { refresh_token: refresh });
  if (!t) {
    jar.delete(ACCESS);
    jar.delete(REFRESH);
    return null;
  }
  await setTokens(t);
  return staffRow(t.user.id);
}
