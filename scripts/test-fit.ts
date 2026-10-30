// "Can my vehicle cross?" maths (Phase 6C): plain code, no AI, no network. Usage: pnpm test:fit
import { computeFit, lowerOnly, profileFor, roadSideOf } from "../src/lib/fit/fit.ts";
import type { RoadSide } from "../src/lib/fit/types.ts";

let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
  if (!ok) fail++;
};
const road = (gap: [number, number] | null, x: Partial<RoadSide> = {}): RoadSide => ({
  type: "landslide", status: "one_lane", gapM: gap ? { min: gap[0], max: gap[1] } : null, totalM: 7, photoAgeH: 1, edgeRisk: false, ...x,
});
const swift = profileFor({ vehicleId: "maruti-swift" })!;
const innova = profileFor({ vehicleId: "toyota-innova-crysta" })!;
const bus = profileFor({ vehicleId: "volvo-9600" })!;
const bike = profileFor({ vehicleId: "re-classic-350" })!;
const f = (v = swift, r = road([3.0, 3.5])) => computeFit(v, r);

check("Swift, gap 3.0–3.5 m → fits", f().verdict === "fits", `${f().headline} · needs ${f().neededM.toFixed(2)} m`);
check("Innova, Aut gap 2.6–3.2 → tight", f(innova, road([2.6, 3.2])).verdict === "tight", `needs ${f(innova, road([2.6, 3.2])).neededM.toFixed(2)} m`);
check("Bus, gap 2.6–3.2 → won't fit", f(bus, road([2.6, 3.0])).verdict === "wont_fit", f(bus, road([2.6, 3.0])).headline);
check("no gap → unknown", f(swift, road(null)).verdict === "unknown", f(swift, road(null)).headline);
const stale = f(swift, road([3.0, 3.5], { photoAgeH: 9 }));
check("old photo caps fits → tight", stale.verdict === "tight" && stale.caps.length === 1, stale.caps.join("; "));
check("no photo caps fits → tight", f(swift, road([3, 3.5], { photoAgeH: null })).verdict === "tight", "tight");
const closed = f(bike, road([0, 0], { status: "closed" }));
check("closed, fully blocked → won't fit (for when it reopens)", closed.verdict === "wont_fit" && closed.caps.some((c) => /reopens/.test(c)), closed.caps.join("; "));
check("valley edge adds 0.3 m", f(swift, road([2.6, 3.0], { edgeRisk: true })).neededM - f(swift, road([2.6, 3.0])).neededM > 0.29, "+0.3 m");
check("edge risk turns a fit tight", f(swift, road([2.6, 3.0])).verdict === "fits" && f(swift, road([2.6, 3.0], { edgeRisk: true })).verdict === "tight", "fits → tight");
const fold = f(innova, road([2.5, 2.9]));
check("fold mirrors helps", fold.verdict === "tight" && fold.foldMirrorsHelps, `with mirrors ${fold.widthWithMirrorsM.max.toFixed(2)} m`);
check("bike fits a 1.6 m gap", f(bike, road([1.6, 2.0])).verdict === "fits", "fits");
check("bus gets a length note", Boolean(f(bus, road([3, 4])).lengthNote), f(bus, road([3, 4])).lengthNote ?? "");
const cat = profileFor({ category: "suv" })!;
check("category uses the widest for fits", f(cat, road([2.7, 3.2])).verdict === "tight" && f(cat, road([3.2, 3.6])).verdict === "fits", "SUV range 1.75–1.95 m");
check("AI can lower", lowerOnly("fits", "tight") === "tight" && lowerOnly("tight", "wont_fit") === "wont_fit", "fits → tight, tight → won't fit");
check("AI can't raise", lowerOnly("tight", "fits") === "tight" && lowerOnly("wont_fit", "tight") === "wont_fit" && lowerOnly("unknown", "fits") === "unknown", "kept");
const rs = roadSideOf({ type: "road_damage", status: "one_lane", measurements: { roadWidthLeftM: { min: 3, max: 4 }, roadTotalWidthM: { min: 6, max: 7 } }, photoAt: new Date().toISOString() });
check("roadSideOf", rs.edgeRisk && rs.totalM === 6.5 && rs.gapM?.min === 3, JSON.stringify(rs));
check("unknown vehicle → null", profileFor({ vehicleId: "nope" }) === null, "null");

console.log(fail ? `\n${fail} FAILED` : "\nall fit checks passed");
process.exit(fail ? 1 : 0);
