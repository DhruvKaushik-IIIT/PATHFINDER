// Admin: create (or update) an invite-only official / crew account. There is no public sign-up for
// the Command Centre — this script, run with the service role, is the only way in (CLAUDE.md 7.5, 8).
// An account = a Supabase Auth user (login email derived from the Department ID) + a `users` row
// with the role, org and district. Re-running updates the password/org instead of duplicating.
//
//   pnpm create-official                                   → demo account "PWD Mandi (demo)"
//   pnpm create-official --dept=PWD-KULLU-01 --name="PWD Kullu" --district=Kullu --role=official --password=…
//   (or set OFFICIAL_PASSWORD instead of --password so it stays out of shell history)
import { hasDb, supabaseUrl } from "../src/lib/db/supabase.ts";
import { DISTRICTS } from "../src/lib/official/districts.ts";
import { DEMO_OFFICIAL, deptEmail } from "../src/lib/official/dept.ts";

const DEMO = DEMO_OFFICIAL;

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const dept = arg("dept") ?? DEMO.dept;
const isDemo = dept === DEMO.dept;
const name = arg("name") ?? (isDemo ? DEMO.name : dept);
const district = arg("district") ?? DEMO.district;
const role = arg("role") ?? "official";
const password = arg("password") ?? process.env.OFFICIAL_PASSWORD ?? (isDemo ? DEMO.password : undefined);

if (!hasDb()) throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
if (!password || password.length < 8) throw new Error("Give a password of 8+ characters (--password=… or OFFICIAL_PASSWORD)");
if (!["official", "crew", "admin"].includes(role)) throw new Error("--role must be official, crew or admin");
if (!DISTRICTS.some((d) => d.name === district)) throw new Error(`--district must be one of ${DISTRICTS.map((d) => d.name).join(", ")}`);

const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const auth = `${supabaseUrl()}/auth/v1/admin/users`;
const email = deptEmail(dept);

async function call<T>(method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: T }> {
  const res = await fetch(url, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
}

// 1. Auth user (create, or find + reset password).
let authId: string;
const created = await call<{ id?: string; error_code?: string; msg?: string }>("POST", auth, {
  email,
  password,
  email_confirm: true,
  user_metadata: { dept_id: dept },
});
if (created.status < 300 && created.json.id) {
  authId = created.json.id;
  console.log(`created auth user for ${dept}`);
} else if (created.status === 422 || created.json.error_code === "email_exists") {
  let found: string | undefined;
  for (let page = 1; !found && page < 50; page++) {
    const { json } = await call<{ users: { id: string; email: string }[] }>("GET", `${auth}?page=${page}&per_page=200`);
    if (!json.users.length) break;
    found = json.users.find((u) => u.email === email)?.id;
  }
  if (!found) throw new Error(`auth user for ${dept} exists but could not be found`);
  authId = found;
  const upd = await call("PUT", `${auth}/${authId}`, { password, user_metadata: { dept_id: dept } });
  if (upd.status >= 300) throw new Error(`password update failed: HTTP ${upd.status}`);
  console.log(`auth user for ${dept} already existed → password updated`);
} else {
  throw new Error(`create auth user failed: HTTP ${created.status} ${created.json.msg ?? ""}`);
}

// 2. Our users row with the role (the actual access gate).
const row = await call<{ id: string }[]>(
  "POST",
  `${supabaseUrl()}/rest/v1/users?on_conflict=auth_user_id`,
  { auth_user_id: authId, display_name: name, role, org: name, district, is_demo: isDemo },
  { Prefer: "resolution=merge-duplicates,return=representation" },
);
if (row.status >= 300) throw new Error(`users upsert failed: HTTP ${row.status} ${JSON.stringify(row.json).slice(0, 200)}`);

console.log(`✓ ${name} · ${role} · ${district} — sign in at /official/login with Department ID ${dept}`);
if (isDemo && password === DEMO.password) console.log(`  (public demo password: ${DEMO.password})`);
