// Client-side: fetch road data at the current data version (Nov 1 sync fix). One tiny never-cached
// request (/api/version, re-used for 3 s) gives a version that changes the moment anything changes;
// adding it to the URL lets caches serve repeats instantly but never an answer older than the last change.
let memo: { at: number; v: string | null } | null = null;
let inflight: Promise<string | null> | null = null;

export function currentVersion(): Promise<string | null> {
  if (memo && Date.now() - memo.at < 3000) return Promise.resolve(memo.v);
  inflight ??= fetch("/api/version", { cache: "no-store" })
    .then((r) => r.json() as Promise<{ data?: { v: string | null } }>)
    .then((b) => b.data?.v ?? null)
    .catch(() => null)
    .then((v) => {
      memo = { at: Date.now(), v };
      return v;
    })
    .finally(() => (inflight = null));
  return inflight;
}

/** Forget the version (call after this device changed something, so the next read is fresh). */
export function bumpVersion(): void {
  memo = null;
}

/** fetch() for road data: appends `v=<data version>` (or fetches uncached when the version is unknown). */
export async function liveFetch(url: string, init?: RequestInit): Promise<Response> {
  const v = await currentVersion();
  if (!v) return fetch(url, { ...init, cache: "no-store" });
  return fetch(`${url}${url.includes("?") ? "&" : "?"}v=${v}`, init);
}
