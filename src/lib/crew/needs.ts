// Client-safe, plain code (no AI): what a site needs — machines and people by skill — worked out from
// the event type, status and the measured debris volume (SAM photos → clearing/estimate.ts).
// The AI may explain this plan later, but it never sets these numbers (CLAUDE.md 6.2).
//
// Rules of thumb (hill-road PWD practice, rough):
//  - A backhoe/excavator moves ~12–30 m³/h of slide debris on a narrow road (same as estimate.ts).
//  - Aim to open one lane within ~6 h of the crew arriving; a narrow hill road fits at most 2 digging
//    machines at one face (3 when the blocked stretch is >40 m long, 4 when >80 m).
//  - Every digging machine needs tippers to haul debris away (2 when there's a lot, else 1).
//  - People: 1 operator per digging machine / snow cutter / loader / rock breaker, 1 driver per tipper,
//    2 helpers per digging machine (min 2), 2 traffic marshals (one at each end) when traffic still
//    moves or queues, 1 supervisor (JE / mate) per crew.
import { debrisVolumeM3, type Range } from "../clearing/estimate.ts";

export type MachineKind = "backhoe" | "excavator" | "tipper" | "rock_breaker" | "dozer" | "snow_cutter" | "loader";
export type Skill = "supervisor" | "operator" | "driver" | "helper" | "marshal";

/** Kinds that can dig/load debris (a backhoe and an excavator are interchangeable for this). */
export const DIGGING: MachineKind[] = ["excavator", "backhoe"];

export interface NeedsInput {
  type: string;
  status: string;
  /** Event measurements from SAM (blockedLengthM, blockedPct, roadTotalWidthM, debrisVolumeM3 …). */
  measurements?: {
    blockedLengthM?: Range | null;
    blockedPct?: Range | null;
    roadTotalWidthM?: Range | number | null;
    roadWidthLeftM?: Range | null;
    debrisVolumeM3?: Range | null;
    vehiclesVisible?: number | null;
  } | null;
  /** Big rocks seen on the road (SAM "boulder"/"rock" or the claim) → add a rock breaker. */
  boulders?: boolean;
}

export interface Needs {
  /** "digging" = backhoe OR excavator; the rest are exact kinds. */
  machines: { digging: number; tipper: number; rock_breaker: number; snow_cutter: number; loader: number };
  people: Record<Skill, number>;
  totalPeople: number;
  /** m³ used for the maths (null = no measurement, defaults by status). */
  volumeM3: Range | null;
  /** Plain reasons shown to the office ("~500–1,200 m³ of debris → 2 diggers to open a lane in ~6 h"). */
  reasons: string[];
  /** Hours to open one lane with this crew, once on site (null when not a debris job). */
  oneLaneHours: Range | null;
}

const RATE: Range = { min: 12, max: 30 }; // m³/h per digging machine
const TARGET_H = 6;
const mid = (r: Range) => (r.min + r.max) / 2;
const fmt = (n: number) => n.toLocaleString("en-IN");

function maxAtFace(lengthM: Range | null | undefined): number {
  const l = lengthM ? mid(lengthM) : 0;
  return l > 80 ? 4 : l > 40 ? 3 : 2;
}

export function siteNeeds(e: NeedsInput): Needs {
  const m = e.measurements ?? {};
  const machines = { digging: 0, tipper: 0, rock_breaker: 0, snow_cutter: 0, loader: 0 };
  const reasons: string[] = [];
  let helpersExtra = 0;
  let marshals = e.status === "closed" ? 2 : e.status === "open" ? 0 : 2;
  let oneLaneHours: Range | null = null;
  const volume = m.debrisVolumeM3 ?? debrisVolumeM3(e.type, m);

  if (e.status === "open" || e.type === "clear") {
    return { machines, people: { supervisor: 0, operator: 0, driver: 0, helper: 0, marshal: 0 }, totalPeople: 0, volumeM3: null, reasons: ["Road is open — no crew needed"], oneLaneHours: null };
  }

  switch (e.type) {
    case "landslide": {
      const cap = maxAtFace(m.blockedLengthM);
      if (volume) {
        // Only the share needed for one lane counts towards the 6 h target (rest can follow).
        const oneLaneShare = (m.blockedPct?.max ?? 100) >= 90 ? 0.6 : 0.4;
        const needed = Math.ceil((mid(volume) * oneLaneShare) / (mid(RATE) * TARGET_H));
        machines.digging = Math.max(1, Math.min(cap, needed));
        const v = mid(volume);
        machines.tipper = machines.digging * (v > 150 ? 2 : 1);
        oneLaneHours = {
          min: Math.round(((volume.min * oneLaneShare) / (RATE.max * machines.digging) + 0.5) * 2) / 2,
          max: Math.round(((volume.max * oneLaneShare) / (RATE.min * machines.digging) + 1) * 2) / 2,
        };
        reasons.push(
          `~${fmt(volume.min)}–${fmt(volume.max)} m³ of debris (from photos) → ${machines.digging} digging machine${machines.digging > 1 ? "s" : ""} to open one lane in ~${oneLaneHours.min}–${oneLaneHours.max} h`,
        );
        if (needed > cap) reasons.push(`Only ${cap} machines fit at one face on this stretch — more would wait in the queue`);
        reasons.push(`${machines.tipper} tipper${machines.tipper > 1 ? "s" : ""} to haul debris away (${v > 150 ? "2 per machine, a lot of debris" : "1 per machine"})`);
      } else {
        machines.digging = e.status === "closed" ? 2 : 1;
        machines.tipper = machines.digging;
        reasons.push(`No debris measurement yet → default for a ${e.status === "closed" ? "closed" : "partly open"} road: ${machines.digging} digging machine${machines.digging > 1 ? "s" : ""} + ${machines.tipper} tipper${machines.tipper > 1 ? "s" : ""}`);
      }
      if (e.boulders) {
        machines.rock_breaker = 1;
        reasons.push("Large boulders on the road → 1 rock breaker");
      }
      break;
    }
    case "snow":
    case "ice": {
      machines.snow_cutter = e.status === "closed" ? 2 : 1;
      machines.loader = 1;
      helpersExtra = 2; // spreading grit / salt, chains
      reasons.push(`${e.type === "ice" ? "Ice" : "Snow"} on a ${e.status === "closed" ? "closed" : "partly open"} road → ${machines.snow_cutter} snow cutter${machines.snow_cutter > 1 ? "s" : ""} + 1 loader, 2 extra helpers for grit`);
      break;
    }
    case "road_damage": {
      machines.digging = 1;
      machines.tipper = 2;
      helpersExtra = 2; // crate / gabion work, edge barricade
      reasons.push("Road edge damaged → 1 digging machine + 2 tippers of fill, 2 extra helpers for crates/barricades");
      break;
    }
    case "flood_water": {
      machines.digging = 1;
      helpersExtra = 1;
      reasons.push("Water on the road → 1 digging machine to clear the drain + helpers");
      break;
    }
    case "traffic":
    case "accident":
    case "closure_notice":
    default: {
      marshals = e.status === "closed" ? 2 : 4;
      reasons.push("No clearing work → traffic marshals only");
    }
  }

  const people: Record<Skill, number> = {
    supervisor: 1,
    operator: machines.digging + machines.snow_cutter + machines.loader + machines.rock_breaker,
    driver: machines.tipper,
    helper: (machines.digging ? Math.max(2, machines.digging * 2) : 0) + helpersExtra,
    marshal: marshals,
  };
  if (people.marshal) reasons.push(`${people.marshal} traffic marshals (one at each end)`);
  const totalPeople = Object.values(people).reduce((a, b) => a + b, 0);
  return { machines, people, totalPeople, volumeM3: volume, reasons, oneLaneHours };
}

export const SKILL_WORD: Record<Skill, [string, string]> = {
  supervisor: ["supervisor", "supervisors"],
  operator: ["machine operator", "machine operators"],
  driver: ["tipper driver", "tipper drivers"],
  helper: ["helper", "helpers"],
  marshal: ["traffic marshal", "traffic marshals"],
};
export const MACHINE_WORD: Record<keyof Needs["machines"], [string, string]> = {
  digging: ["JCB / excavator", "JCBs / excavators"],
  tipper: ["tipper", "tippers"],
  rock_breaker: ["rock breaker", "rock breakers"],
  snow_cutter: ["snow cutter", "snow cutters"],
  loader: ["loader", "loaders"],
};

/** "2 JCBs / excavators · 4 tippers · 1 rock breaker" */
export function machinesText(n: Needs["machines"]): string {
  return (Object.keys(n) as (keyof Needs["machines"])[])
    .filter((k) => n[k] > 0)
    .map((k) => `${n[k]} ${MACHINE_WORD[k][n[k] > 1 ? 1 : 0]}`)
    .join(" · ");
}
/** "1 supervisor · 2 machine operators · 4 tipper drivers · 4 helpers · 2 traffic marshals" */
export function peopleText(p: Record<Skill, number>): string {
  return (Object.keys(p) as Skill[])
    .filter((k) => p[k] > 0)
    .map((k) => `${p[k]} ${SKILL_WORD[k][p[k] > 1 ? 1 : 0]}`)
    .join(" · ");
}
