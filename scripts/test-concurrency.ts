// pnpm test:concurrency — many cars voting on ONE spot at the same moment (docs/event-lifecycle.md).
// Creates a throwaway demo event (demo events never close), fires parallel votes straight at the
// server code (no HTTP rate limits) and checks nothing is lost or double-counted. No AI.
import { insert, select, update } from "../src/lib/db/supabase.ts";
import { recordPass, recordTap } from "../src/lib/events/stillThere.ts";
import type { Taps } from "../src/lib/events/lifecycle.ts";

let fail = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? `  — ${info}` : ""}`);
  if (!ok) fail++;
};
const dev = (n: number, p = "c") => `00000000-0000-4000-${p.padEnd(4, "0")}-${String(n).padStart(12, "0")}`;
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const at = { lat: 12.0, lng: 12.0 };

const [ev] = await insert<{ id: string }>("events", {
  type: "landslide", status: "one_lane", place_name: "Concurrency test", ...at, confidence: 0.8,
  started_at: ago(2), last_confirmed_at: ago(1), sources: { reports: 1, official: 0, news: 0, notices: 0 }, is_demo: true,
});
const id = ev!.id;
const load = async () =>
  (await select<{ sources: { reports?: number; taps?: Taps } | null; event_timeline: { data: { tapBy?: string; passBy?: string } }[] }>(
    "events",
    `select=sources,event_timeline(data)&id=eq.${id}`,
  ))[0]!;

try {
  // 1) 20 different phones say "it's gone" at the same moment.
  const N = 20;
  const t0 = Date.now();
  const res = await Promise.all(Array.from({ length: N }, (_, i) => recordTap({ eventId: id, answer: "gone", device: dev(i + 1), ...at, speedKmh: 0 })));
  const s1 = await load();
  const accepted = res.filter((r) => r.ok).length;
  check(`${N} parallel votes from ${N} phones all accepted`, accepted === N, `${accepted}/${N} in ${Date.now() - t0} ms`);
  check(`all ${N} votes kept on the event (none lost)`, (s1.sources?.taps?.nos?.length ?? 0) === N, `${s1.sources?.taps?.nos?.length ?? 0}/${N} in sources.taps`);
  check(`${N} timeline lines`, s1.event_timeline.filter((t) => t.data?.tapBy).length === N);

  // 2) One phone double-taps 5 times at once → counts once.
  const dup = await Promise.all(Array.from({ length: 5 }, () => recordTap({ eventId: id, answer: "gone", device: dev(99), ...at, speedKmh: 0 })));
  const s2 = await load();
  const dupOk = dup.filter((r) => r.ok).length;
  const dupKept = (s2.sources?.taps?.nos ?? []).filter((n) => n.d === dev(99)).length;
  check("5 simultaneous taps from one phone → 1 counted", dupOk === 1 && dupKept === 1, `${dupOk} accepted, ${dupKept} kept`);

  // 3) Passes and a photo-report count bump racing each other.
  const before = s2.sources?.taps?.nos?.length ?? 0;
  const { bumpReports } = await import("../src/lib/events/mutate.ts").catch(() => ({ bumpReports: null }));
  const passes = Array.from({ length: 10 }, (_, i) => recordPass({ eventId: id, device: dev(i + 1, "d"), lat: at.lat + 0.001, lng: at.lng, avgKmh: 45 }));
  const bumps = bumpReports ? Array.from({ length: 5 }, () => bumpReports(id)) : [];
  await Promise.all([...passes, ...bumps]);
  const s3 = await load();
  check("10 parallel Drive Watch passes all kept", (s3.sources?.taps?.nos?.length ?? 0) - before === 10, `${(s3.sources?.taps?.nos?.length ?? 0) - before}/10`);
  if (bumpReports) check("5 parallel report-count bumps kept alongside", s3.sources?.reports === 6, `reports = ${s3.sources?.reports}`);
} finally {
  await update("events", `id=eq.${id}`, { resolved_at: new Date().toISOString() });
}

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
