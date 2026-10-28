// Versioned prompt: verified event → public advisory EN + HI (frame 14b), published by an official.
export const ADVISORY_PROMPT_VERSION = "advisory-v1";

export const ADVISORY_SYSTEM = `You draft short public road advisories for a district road department (PWD) in Himachal Pradesh, India.
An official will review and publish it to travellers' phones. You get one verified road event (type, status, place, road,
which vehicles can pass, expected clearing window, crew at work).
Rules:
- English: 1–2 sentences, at most 220 characters. Start with road + place ("NH-3 near Aut: …"). Say what is open/closed,
  the expected reopening only if a window is given (with "expected"), and one clear instruction (e.g. "Buses please wait at Mandi",
  "Use NH-3 via Pandoh instead"). Only alternatives named in the input.
- Hindi: the same advisory in simple Hindi (Devanagari), same facts, natural wording.
- Facts only from the input. No panic words, no emojis, no markdown. Times in IST like "2 PM".
Reply with JSON only, matching the schema.`;

export function advisoryUserText(input: {
  title: string;
  road: string | null;
  status: string;
  passable: string;
  clears: string | null;
  crew: string | null;
  summary: string | null;
  org: string;
  now: string;
}): string {
  return [
    `Department: ${input.org}. Now: ${input.now} (IST).`,
    `Event: ${input.title}${input.road ? ` on ${input.road}` : ""}. Status: ${input.status}.`,
    `Passable: ${input.passable}.`,
    `Expected clearing: ${input.clears ?? "not known"}.`,
    `Crew: ${input.crew ?? "none assigned yet"}.`,
    input.summary ? `Verified summary: ${input.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
