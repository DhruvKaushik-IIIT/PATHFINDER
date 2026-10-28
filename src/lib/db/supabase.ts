// Server-only: tiny Supabase client over HTTPS (PostgREST + Storage) with the service role.
// Plain fetch, no SDK — cloud sessions can't open raw Postgres, and this keeps deps small.
// Never import from a client component: SUPABASE_SERVICE_ROLE_KEY bypasses RLS.

export function supabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (raw) return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  // Fallback: project ref from the pooler username ("postgres.<ref>").
  const db = process.env.SUPABASE_DB_URL;
  const ref = db ? new URL(db).username.split(".")[1] : undefined;
  return ref ? `https://${ref}.supabase.co` : null;
}

export function hasDb(): boolean {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export class DbError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function auth(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new DbError("SUPABASE_SERVICE_ROLE_KEY missing");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function base(): string {
  const url = supabaseUrl();
  if (!url) throw new DbError("NEXT_PUBLIC_SUPABASE_URL missing");
  return url;
}

async function check(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new DbError(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
  return res;
}

/** SELECT via PostgREST query string, e.g. select("photos", "sha256=eq.abc&select=id"). */
export async function select<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${base()}/rest/v1/${table}?${query}`, { headers: auth(), cache: "no-store" });
  return (await check(res, `select ${table}`)).json() as Promise<T[]>;
}

/** INSERT one or many rows, returning them. */
export async function insert<T>(table: string, rows: object | object[]): Promise<T[]> {
  const res = await fetch(`${base()}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  return (await check(res, `insert ${table}`)).json() as Promise<T[]>;
}

/** UPDATE rows matching a PostgREST filter, e.g. update("photos", "id=eq.…", {...}). */
export async function update<T>(table: string, filter: string, patch: object): Promise<T[]> {
  const res = await fetch(`${base()}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...auth(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return (await check(res, `update ${table}`)).json() as Promise<T[]>;
}

/** Call a SQL function, e.g. rpc("nearest_segment", { p_lat, p_lng }). */
export async function rpc<T>(fn: string, args: object): Promise<T> {
  const res = await fetch(`${base()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return (await check(res, `rpc ${fn}`)).json() as Promise<T>;
}

/** Upload (upsert) a file to Storage. Returns the object path inside the bucket. */
export async function upload(bucket: string, path: string, body: Buffer, contentType: string): Promise<string> {
  const res = await fetch(`${base()}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(body),
  });
  await check(res, `upload ${bucket}/${path}`);
  return path;
}

/** Public URL for an object in a public bucket (photos-public). */
export function publicUrl(bucket: string, path: string): string {
  return `${base()}/storage/v1/object/public/${bucket}/${path}`;
}
