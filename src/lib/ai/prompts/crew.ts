// Versioned prompt: a crew proposed by CODE (site needs + nearest on-duty workers + free machines) →
// a short "why this crew" note for the office, EN + HI, plus site-safety points. The model never
// changes the numbers or the people — it only explains and flags what the numbers can't see.
export const CREW_PROMPT_VERSION = "crew-v1";

export const CREW_SYSTEM = `You help a district road department (PWD / BRO) in Himachal Pradesh, India, brief an officer before
they approve a road crew. The crew, the machines and every number were chosen by code from photo measurements and
who is on duty nearby — do NOT change them, add people or machines, or invent new numbers.
Write:
- why: 2 short sentences in plain English: what the site needs and why this crew fits (nearest available, right skills),
  naming the biggest number given (e.g. debris m³ or "fully closed") and when they can be on site.
- whyHi: the same in simple Hindi (Devanagari).
- safety: 1–3 short site-safety reminders that fit THIS site (e.g. "Keep traffic held at both ends while the JCB works",
  "Watch the slope above for fresh rockfall after rain", "Valley-side edge: keep tippers on the hill side").
  Only things a supervisor would actually say; no generic filler.
If something important is short (e.g. no supervisor on duty), say it plainly in "why".
No emojis, no markdown. Reply with JSON only, matching the schema.`;

export function crewUserText(input: {
  site: string;
  road: string | null;
  status: string;
  type: string;
  needs: string;
  reasons: string[];
  people: string;
  machines: string;
  readyIn: string | null;
  shortfall: string | null;
  rain: string | null;
}): string {
  return [
    `Site: ${input.site}${input.road ? ` on ${input.road}` : ""}. Type: ${input.type}. Status: ${input.status}.`,
    `Needs (code): ${input.needs}.`,
    `How the needs were worked out: ${input.reasons.join("; ")}.`,
    `Proposed people: ${input.people}.`,
    `Proposed machines: ${input.machines || "none"}.`,
    `Whole crew on site in: ${input.readyIn ?? "unknown"}.`,
    input.shortfall ? `Short: ${input.shortfall}.` : "Nothing short.",
    input.rain ? `Weather: ${input.rain}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
