// pnpm fetch-weather-replay [YYYY-MM-DD] — save a REAL past day's hourly rain (Open-Meteo archive, ERA5)
// on a ~11 km grid over the Mandi → Kullu → Manali → Sissu corridor + Shimla/Bilaspur, to
// data/seed/weather/replay.json. /route and /nearby can then show that day's rain mapped onto today
// (?replay=1, labelled "Replay of <date>") — for demoing the rain-risk banner on a dry day.
// Default day: 2025-08-13 (heavy monsoon rain in Mandi/Kullu). Free, no key; ~1 request per 50 points.
import { mkdirSync, writeFileSync } from "node:fs";

const date = process.argv[2] ?? "2025-08-13";
const pts: { lat: number; lng: number }[] = [];
for (let lat = 31.0; lat <= 32.55; lat += 0.1) for (let lng = 76.6; lng <= 77.45; lng += 0.1) pts.push({ lat: +lat.toFixed(2), lng: +lng.toFixed(2) });

const out: { lat: number; lng: number; hourly: unknown }[] = [];
for (let i = 0; i < pts.length; i += 50) {
  const chunk = pts.slice(i, i + 50);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${chunk.map((p) => p.lat).join(",")}&longitude=${chunk.map((p) => p.lng).join(",")}` +
    `&start_date=${date}&end_date=${date}&hourly=precipitation,snowfall&timezone=GMT`;
  // IST day = UTC previous-day 18:30 → same-day 18:30; the UTC day is close enough for a demo replay.
  const res = await fetch(url, { headers: { "User-Agent": "Pathfinder/0.1 (hackathon demo)" } });
  const body = (await res.json()) as { hourly: unknown }[] | { error: boolean; reason: string };
  if (!Array.isArray(body)) throw new Error(`Open-Meteo: ${(body as { reason: string }).reason ?? res.status}`);
  body.forEach((b, j) => out.push({ ...chunk[j]!, hourly: b.hourly }));
  console.log(`fetched ${out.length}/${pts.length}`);
}
const total = (p: { hourly: unknown }) => ((p.hourly as { precipitation: (number | null)[] }).precipitation ?? []).reduce<number>((t, x) => t + (x ?? 0), 0);
const wettest = [...out].sort((a, b) => total(b) - total(a)).slice(0, 5);
mkdirSync("data/seed/weather", { recursive: true });
writeFileSync("data/seed/weather/replay.json", JSON.stringify({ date, source: "Open-Meteo archive (ERA5)", points: out }));
console.log(`saved data/seed/weather/replay.json · ${out.length} points · wettest:`, wettest.map((p) => `${p.lat},${p.lng}=${total(p).toFixed(1)}mm`).join("  "));
