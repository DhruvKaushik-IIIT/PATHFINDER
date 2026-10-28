// pnpm test:risk — Risk Forecast v1 scoring rules on synthetic hourly series (no network, no AI),
// then one live call per API shape if Open-Meteo answers.
import { _internal, areaRisk, levelOf, routeRisk } from "../src/lib/risk/forecast.ts";
import { planRoute } from "../src/lib/geo/route.ts";

const now = Date.UTC(2026, 9, 28, 12);
const series = (rain: number[]) =>
  _internal.toSeries({ hourly: { time: rain.map((_, i) => new Date(now + i * 3_600_000).toISOString().slice(0, 16)), precipitation: rain, precipitation_probability: rain.map((r) => (r > 0 ? 80 : 5)) } });
const cases: [string, number[], number, string][] = [
  ["dry", [0, 0, 0, 0, 0], 0, "none"],
  ["drizzle", [0.3, 0.4, 0.5, 0], 0, "low"],
  ["drizzle on a slide-prone slope", [0.3, 0.4, 0.5, 0], 2, "moderate"],
  ["steady rain 6 mm", [1.5, 1.5, 1.5, 1.5], 0, "moderate"],
  ["cloudburst hour", [0.5, 8, 1, 0], 0, "high"],
  ["steady rain + 3 slides", [1.5, 1.5, 1.5, 1.5], 3, "high"],
];
let fail = 0;
for (const [name, rain, slides, want] of cases) {
  const st = _internal.stats(series(rain), now, now + 4 * 3_600_000, slides);
  const got = levelOf(st).level;
  if (got !== want) fail++;
  console.log(`${got === want ? "✓" : "✗"} ${name}: ${st.rainMm} mm, max ${st.maxHourlyMm} mm/h, ${slides} slides → ${got} (want ${want})`);
}

const t = Date.now();
try {
  const plan = await planRoute({ name: "Mandi", lat: 31.708, lng: 76.932 }, { name: "Manali", lat: 32.2432, lng: 77.1892 }, new Date());
  const r = await routeRisk(plan);
  console.log(`\nlive route Mandi → Manali: ${r.level} · ${r.headline ?? r.weatherLine} · ${r.stretches.length} stretches · ${Date.now() - t} ms`);
  const a = await areaRisk(31.708, 76.932, 25);
  console.log(`live area Mandi 25 km: ${a.level} · ${a.headline} · ${a.cells.length} cells`);
} catch (err) {
  console.log("live check skipped:", (err as Error).message);
}
process.exit(fail ? 1 : 0);
