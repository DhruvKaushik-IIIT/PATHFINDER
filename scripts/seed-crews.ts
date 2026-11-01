// Option B Part A: demo field workers + machines at real depot towns (PWD divisions, BRO camps),
// and the two standing crews already at work (Crew A at Aut, BRO snow cutter at Atal Tunnel).
// People are FICTIONAL (typical Himachali names) and every row is is_demo=true.
// Needs migration 0004_crew_builder.sql. Fixed ids → re-running updates instead of duplicating.
// Run:  pnpm seed-crews          (after `pnpm seed`, which creates the events + crews A–D)
//       pnpm seed-crews --wipe   (delete the demo workers, machines and their users rows)
import { hasDb, supabaseUrl } from "../src/lib/db/supabase.ts";

if (!hasDb()) {
  console.error("Supabase env vars missing");
  process.exit(1);
}
const base = `${supabaseUrl()}/rest/v1`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function req(method: string, path: string, body?: unknown, prefer?: string): Promise<void> {
  const res = await fetch(`${base}/${path}`, { method, headers: { ...headers, ...(prefer && { Prefer: prefer }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const uid = (block: string, n: number) => `00000000-0000-4000-${block}-${String(n).padStart(12, "0")}`;
const userId = (n: number) => uid("b000", n);
const workerId = (n: number) => uid("c000", n);
const machineId = (n: number) => uid("d000", n);
const crewId = (n: number) => uid("9000", n); // same ids as scripts/seed.ts
const eventId = (n: number) => uid("8000", n);
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

if (process.argv.includes("--wipe")) {
  await req("PATCH", "crews?is_demo=eq.true", { supervisor_id: null });
  for (const t of ["workers", "machines"]) await req("DELETE", `${t}?is_demo=eq.true`);
  await req("DELETE", `users?id=like.00000000-0000-4000-b000-*`);
  console.log("wiped demo workers, machines and their users rows");
  process.exit(0);
}

// ---------------------------------------------------------------- depots (real towns, approx. coords)
type Depot = { name: string; lat: number; lng: number; district: string; org: string };
const D: Record<string, Depot> = {
  mandi: { name: "Mandi (PWD division store)", lat: 31.7085, lng: 76.9318, district: "Mandi", org: "PWD Mandi" },
  pandoh: { name: "Pandoh", lat: 31.6692, lng: 77.0577, district: "Mandi", org: "PWD Mandi" },
  aut: { name: "Aut", lat: 31.7427, lng: 77.2084, district: "Mandi", org: "PWD Mandi" },
  sundernagar: { name: "Sundernagar", lat: 31.5332, lng: 76.8923, district: "Mandi", org: "PWD Mandi" },
  jogindernagar: { name: "Jogindernagar", lat: 31.9871, lng: 76.7894, district: "Mandi", org: "PWD Mandi" },
  kullu: { name: "Kullu (PWD division)", lat: 31.9578, lng: 77.1095, district: "Kullu", org: "PWD Kullu" },
  bhuntar: { name: "Bhuntar", lat: 31.8762, lng: 77.1515, district: "Kullu", org: "PWD Kullu" },
  manali: { name: "Manali", lat: 32.2432, lng: 77.1892, district: "Kullu", org: "PWD Kullu" },
  sissu: { name: "Sissu (BRO camp)", lat: 32.4805, lng: 77.1236, district: "Lahaul-Spiti", org: "BRO Project Deepak" },
  koksar: { name: "Koksar (BRO camp)", lat: 32.4048, lng: 77.2365, district: "Lahaul-Spiti", org: "BRO Project Deepak" },
  shimla: { name: "Shimla (PWD division)", lat: 31.1048, lng: 77.1734, district: "Shimla", org: "PWD Shimla" },
  theog: { name: "Theog", lat: 31.1213, lng: 77.3566, district: "Shimla", org: "PWD Shimla" },
  dharamshala: { name: "Dharamshala (PWD division)", lat: 32.219, lng: 76.3234, district: "Kangra", org: "PWD Dharamshala" },
  palampur: { name: "Palampur", lat: 32.1109, lng: 76.5363, district: "Kangra", org: "PWD Dharamshala" },
};

// Aut (event 1) and Atal Tunnel south portal (event 6) — where the two standing crews are working now.
const AT_AUT = { lat: 31.7431, lng: 77.2079 };
const AT_ATAL = { lat: 32.364, lng: 77.133 };

type Skill = "supervisor" | "operator" | "driver" | "helper" | "marshal";
// [name, skill, depot, onDuty, crew (1 = Crew A at Aut, 5 = BRO at Atal)]
const W: [string, Skill, keyof typeof D, boolean, number?][] = [
  // Crew A — working at the Aut slide
  ["Rajesh Thakur", "supervisor", "aut", true, 1],
  ["Hem Raj", "operator", "aut", true, 1],
  ["Pawan Kumar", "operator", "aut", true, 1],
  ["Dinesh Sharma", "helper", "aut", true, 1],
  ["Kamal Chauhan", "helper", "aut", true, 1],
  ["Tek Chand", "helper", "aut", true, 1],
  ["Om Prakash", "helper", "aut", true, 1],
  ["Savita Devi", "marshal", "aut", true, 1],
  ["Mohan Lal", "marshal", "aut", true, 1],
  // Mandi pool
  ["Neelam Thakur", "supervisor", "mandi", true],
  ["Bhupender Singh", "supervisor", "pandoh", true],
  ["Sunil Kumar", "operator", "mandi", true],
  ["Ramesh Rana", "operator", "mandi", true],
  ["Kuldeep Sharma", "operator", "pandoh", true],
  ["Vijay Katoch", "operator", "sundernagar", true],
  ["Naresh Guleria", "operator", "jogindernagar", false],
  ["Surender Pal", "driver", "mandi", true],
  ["Jagdish Ram", "driver", "mandi", true],
  ["Mahesh Rana", "driver", "pandoh", true],
  ["Yashpal Thakur", "driver", "sundernagar", true],
  ["Kishori Lal", "driver", "aut", true],
  ["Sanjay Verma", "driver", "jogindernagar", false],
  ["Inder Singh", "helper", "mandi", true],
  ["Chaman Lal", "helper", "mandi", true],
  ["Prem Chand", "helper", "pandoh", true],
  ["Bal Krishan", "helper", "pandoh", true],
  ["Hari Chand", "helper", "sundernagar", true],
  ["Rakesh Sood", "helper", "sundernagar", false],
  ["Meena Kumari", "marshal", "mandi", true],
  ["Gopal Negi", "marshal", "pandoh", true],
  ["Lalit Mehta", "marshal", "sundernagar", true],
  // Kullu
  ["Anjali Sharma", "supervisor", "kullu", true],
  ["Manoj Thakur", "operator", "kullu", true],
  ["Neeraj Chauhan", "operator", "bhuntar", true],
  ["Satish Kumar", "operator", "manali", true],
  ["Devender Thakur", "driver", "kullu", true],
  ["Rajinder Kaushal", "driver", "bhuntar", true],
  ["Bhagat Ram", "driver", "manali", false],
  ["Dharam Singh", "helper", "kullu", true],
  ["Roshan Lal", "helper", "bhuntar", true],
  ["Kanta Devi", "helper", "manali", true],
  ["Pushpa Thakur", "marshal", "kullu", true],
  ["Amar Nath", "marshal", "manali", true],
  // BRO Project Deepak — snow cutter crew at the Atal Tunnel south portal + Lahaul pool
  ["Tashi Angrup", "supervisor", "sissu", true, 5],
  ["Dorje Bodh", "operator", "sissu", true, 5],
  ["Ravi Bodh", "operator", "koksar", true],
  ["Sonam Dolma", "helper", "sissu", true, 5],
  ["Prem Lal", "helper", "koksar", true],
  ["Karan Thakur", "marshal", "sissu", true, 5],
  // Shimla
  ["Vikram Jamwal", "supervisor", "shimla", true],
  ["Sushil Chauhan", "operator", "theog", true],
  ["Ashok Kumar", "driver", "shimla", true],
  ["Ram Lal", "helper", "theog", true],
  ["Geeta Devi", "marshal", "shimla", false],
  // Kangra
  ["Sushil Pathania", "supervisor", "dharamshala", true],
  ["Arun Guleria", "operator", "palampur", true],
  ["Rattan Chand", "driver", "dharamshala", true],
  ["Vinod Katoch", "helper", "palampur", true],
];

// Deterministic small offset (~0.5–3 km) so on-duty workers aren't all on the same pixel.
function jitter(n: number, lat: number, lng: number): { lat: number; lng: number } {
  const a = (n * 137.5 * Math.PI) / 180;
  const r = 0.005 + ((n * 7) % 23) / 1000; // degrees
  return { lat: +(lat + r * Math.sin(a)).toFixed(5), lng: +(lng + r * Math.cos(a)).toFixed(5) };
}

const users = W.map(([name, , depot], i) => ({
  id: userId(i + 1),
  display_name: name,
  role: "crew",
  org: `${D[depot]!.org} (demo)`,
  district: D[depot]!.district,
  is_demo: true,
}));
const workers = W.map(([name, skill, depot, onDuty, crew], i) => {
  const d = D[depot]!;
  const at = crew === 1 ? jitter(i, AT_AUT.lat, AT_AUT.lng) : crew === 5 ? jitter(i, AT_ATAL.lat, AT_ATAL.lng) : jitter(i + 3, d.lat, d.lng);
  return {
    id: workerId(i + 1),
    user_id: userId(i + 1),
    name,
    skill,
    org: `${d.org} (demo)`,
    district: d.district,
    base_name: d.name,
    base_lat: d.lat,
    base_lng: d.lng,
    on_duty: onDuty,
    duty_lat: onDuty ? at.lat : null,
    duty_lng: onDuty ? at.lng : null,
    duty_updated_at: onDuty ? ago(4 + ((i * 11) % 40)) : null,
    crew_id: crew ? crewId(crew) : null,
    is_demo: true,
  };
});

type Kind = "backhoe" | "excavator" | "tipper" | "rock_breaker" | "dozer" | "snow_cutter" | "loader";
const LABEL: Record<Kind, string> = {
  backhoe: "JCB 3DX backhoe",
  excavator: "Tata Hitachi EX200 excavator",
  tipper: "Tata 1613 tipper",
  rock_breaker: "Excavator with hydraulic rock breaker",
  dozer: "BEML D80 dozer",
  snow_cutter: "BEML snow cutter",
  loader: "Wheel loader",
};
// [code, kind, depot, crew]
const M: [string, Kind, keyof typeof D, number?][] = [
  ["JCB-01", "backhoe", "aut", 1],
  ["JCB-02", "backhoe", "aut", 1],
  ["TIP-01", "tipper", "aut", 1],
  ["JCB-03", "backhoe", "mandi"],
  ["JCB-04", "backhoe", "pandoh"],
  ["EXC-01", "excavator", "sundernagar"],
  ["RB-01", "rock_breaker", "mandi"],
  ["DOZ-01", "dozer", "jogindernagar"],
  ["TIP-02", "tipper", "mandi"],
  ["TIP-03", "tipper", "mandi"],
  ["TIP-04", "tipper", "pandoh"],
  ["TIP-05", "tipper", "sundernagar"],
  ["TIP-06", "tipper", "aut"],
  ["LDR-01", "loader", "mandi"],
  ["JCB-11", "backhoe", "kullu"],
  ["JCB-12", "backhoe", "bhuntar"],
  ["TIP-11", "tipper", "kullu"],
  ["TIP-12", "tipper", "bhuntar"],
  ["TIP-13", "tipper", "manali"],
  ["SC-11", "snow_cutter", "manali"],
  ["LDR-11", "loader", "manali"],
  ["SC-21", "snow_cutter", "sissu", 5],
  ["SC-22", "snow_cutter", "koksar"],
  ["DOZ-21", "dozer", "sissu"],
  ["LDR-21", "loader", "koksar"],
  ["JCB-31", "backhoe", "shimla"],
  ["TIP-31", "tipper", "shimla"],
  ["SC-31", "snow_cutter", "theog"],
  ["JCB-41", "backhoe", "dharamshala"],
  ["TIP-41", "tipper", "palampur"],
];
const machines = M.map(([code, kind, depot, crew], i) => {
  const d = D[depot]!;
  const at = crew === 1 ? AT_AUT : crew === 5 ? AT_ATAL : d;
  return {
    id: machineId(i + 1),
    code,
    kind,
    label: LABEL[kind],
    org: `${d.org} (demo)`,
    district: d.district,
    depot_name: d.name,
    lat: at.lat,
    lng: at.lng,
    available: !crew,
    crew_id: crew ? crewId(crew) : null,
    is_demo: true,
  };
});

// The judges' crew demo account (DEMO_CREW): Neelam Thakur, free and on duty near Kamand, ~6 km from the
// Kataula slide → the office's crew builder picks her as supervisor, and her phone gets the job.
const neelam = workers.find((w) => w.name === "Neelam Thakur")!;
Object.assign(neelam, { on_duty: true, duty_lat: 31.7752, duty_lng: 76.9861, duty_updated_at: ago(3) });

await req("POST", "users?on_conflict=id", users, "resolution=merge-duplicates,return=minimal");
await req("POST", "workers?on_conflict=id", workers, "resolution=merge-duplicates,return=minimal");
await req("POST", "machines?on_conflict=id", machines, "resolution=merge-duplicates,return=minimal");

// The two standing crews already at work: link supervisor, mark on site, keep their machine labels.
const supA = workerId(W.findIndex((w) => w[0] === "Rajesh Thakur") + 1);
const supB = workerId(W.findIndex((w) => w[0] === "Tashi Angrup") + 1);
await req("PATCH", `crews?id=eq.${crewId(1)}`, {
  kind: "standing", status: "on_site", supervisor_id: supA, current_event_id: eventId(1), available: false,
  machines: ["JCB-01 JCB 3DX backhoe", "JCB-02 JCB 3DX backhoe", "TIP-01 Tata 1613 tipper"], dispatched_at: ago(420), arrived_at: ago(380),
});
await req("PATCH", `crews?id=eq.${crewId(5)}`, {
  kind: "standing", status: "on_site", supervisor_id: supB, current_event_id: eventId(6), available: false,
  org: "BRO Project Deepak (demo)", name: "BRO snow crew", machines: ["SC-21 BEML snow cutter"], dispatched_at: ago(300), arrived_at: ago(240),
});

const onDuty = workers.filter((w) => w.on_duty).length;
const by = (k: string) => workers.filter((w) => w.district === k).length;
console.log(`seeded ${workers.length} workers (${onDuty} on duty) · ${machines.length} machines`);
console.log(`  by district: Mandi ${by("Mandi")} · Kullu ${by("Kullu")} · Lahaul-Spiti ${by("Lahaul-Spiti")} · Shimla ${by("Shimla")} · Kangra ${by("Kangra")}`);
console.log(`  Crew A at Aut: ${workers.filter((w) => w.crew_id === crewId(1)).length} people + JCB-01, JCB-02, TIP-01 · BRO snow crew at Atal: ${workers.filter((w) => w.crew_id === crewId(5)).length} people + SC-21`);
