// pnpm test:crew-needs — the site-needs rules (no AI, no network).
import { machinesText, peopleText, siteNeeds } from "../src/lib/crew/needs.ts";

let fail = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? `  — ${info}` : ""}`);
  if (!ok) fail++;
};
const show = (n: ReturnType<typeof siteNeeds>) => `${machinesText(n.machines) || "no machines"} | ${peopleText(n.people)} (${n.totalPeople})`;

// Big slide across the whole road (Kataula-like): ~35 m long, fully blocked.
const big = siteNeeds({ type: "landslide", status: "closed", measurements: { blockedLengthM: { min: 30, max: 40 }, blockedPct: { min: 95, max: 100 } } });
check("big slide → 2 diggers (face cap), 2 tippers each", big.machines.digging === 2 && big.machines.tipper === 4, show(big));
check("big slide → has volume + one-lane hours", !!big.volumeM3 && !!big.oneLaneHours, `${JSON.stringify(big.volumeM3)} ${JSON.stringify(big.oneLaneHours)}`);
check("people = 1 sup + operators + drivers + helpers + 2 marshals", big.people.supervisor === 1 && big.people.operator === 2 && big.people.driver === 4 && big.people.helper === 4 && big.people.marshal === 2);

// Long slide: >80 m → up to 4 machines at the face.
const long = siteNeeds({ type: "landslide", status: "closed", measurements: { blockedLengthM: { min: 90, max: 120 }, blockedPct: { min: 95, max: 100 }, debrisVolumeM3: { min: 2000, max: 5000 } } });
check("very long slide → up to 4 diggers", long.machines.digging === 4, show(long));

// Small rocks at the edge, one lane open.
const small = siteNeeds({ type: "landslide", status: "one_lane", measurements: { blockedLengthM: { min: 3, max: 8 }, blockedPct: { min: 20, max: 30 } } });
check("small rockfall → 1 digger, 1 tipper", small.machines.digging === 1 && small.machines.tipper === 1, show(small));

// Boulders → rock breaker + operator.
const b = siteNeeds({ type: "landslide", status: "closed", boulders: true });
check("boulders → rock breaker + its operator", b.machines.rock_breaker === 1 && b.people.operator === b.machines.digging + 1, show(b));
check("no measurement → default by status, says so", b.volumeM3 === null && b.reasons[0]!.startsWith("No debris measurement"));

// Snow closed.
const snow = siteNeeds({ type: "snow", status: "closed" });
check("snow closed → 2 snow cutters + loader, no tippers", snow.machines.snow_cutter === 2 && snow.machines.loader === 1 && snow.machines.tipper === 0, show(snow));

// Traffic jam → marshals only.
const t = siteNeeds({ type: "traffic", status: "slow" });
check("traffic → no machines, 4 marshals", machinesText(t.machines) === "" && t.people.marshal === 4, show(t));

// Open road → nothing.
const o = siteNeeds({ type: "landslide", status: "open" });
check("open → no crew", o.totalPeople === 0);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
