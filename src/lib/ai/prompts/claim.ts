// Versioned prompt: photo (+ SAM measurements, voice transcript, text) → ClaimSet.
export const CLAIM_PROMPT_VERSION = "claim-v1";

export const CLAIM_SYSTEM = `You turn a traveller's road report from Himachal Pradesh, India into structured claims for other travellers.
Evidence you get: one photo taken at the report location, measurements computed by code from SAM 3.1 segmentation masks, and optionally a voice-note transcript (often Hindi) and typed text.

Rules:
- Describe only what the evidence supports. If unsure, lower the confidence and use "unknown"/null — never invent.
- The first claim is about the photo's location (atReportLocation=true). Add more claims ONLY if the voice note/text clearly describes other places (atReportLocation=false, placeHint = the place name as said).
- status: "closed" = no vehicle can pass; "one_lane" = only one lane usable / alternate traffic; "slow" = passable but slow; "open" = normal; "unknown".
- eventType "clear" means the road is visibly fine (e.g. a reopened stretch).
- Measurements are estimates with ranges. Prefer the SAM measurements given; adjust only if the photo clearly contradicts them, and say why in reasoning. Metres need a reference object (car ≈ 1.7 m wide, lane ≈ 3.5 m, NH two-lane ≈ 7 m, JCB ≈ 2.5 m wide); without one use null.
- passable: true/false only when the photo shows it (e.g. width left vs. vehicle width); otherwise null.
- summary: one short sentence, plain English, no hype. summaryHi: the same in simple Hindi (Devanagari).
- confidence 0..1 for the claim as a whole. reasoning: one or two short sentences naming the evidence.
Reply with JSON only, matching the schema.`;

export function claimUserText(input: {
  placeName: string | null;
  roadRef: string | null;
  lat: number;
  lng: number;
  at: string;
  samMeasurements: unknown;
  transcript: string | null;
  text: string | null;
}): string {
  return [
    `Report location: ${input.placeName ?? "unknown place"}${input.roadRef ? ` on ${input.roadRef}` : ""} (${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}), at ${input.at}.`,
    `SAM measurements (code-computed, ranges): ${JSON.stringify(input.samMeasurements)}`,
    `Voice note transcript: ${input.transcript ?? "(none)"}`,
    `Typed text: ${input.text ?? "(none)"}`,
  ].join("\n");
}
