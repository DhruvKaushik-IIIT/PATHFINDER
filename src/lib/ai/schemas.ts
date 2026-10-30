// Zod schemas for every AI output (CLAUDE.md 6.2 rule 1, 6.3). The same schema drives the
// request (`response_format: json_schema`) and the validation of the reply.
import { z } from "zod";

const range = z
  .object({ min: z.number(), max: z.number() })
  .describe("estimate as a range; null when there is no basis for a number");

export const EVENT_TYPES = [
  "landslide", "snow", "ice", "flood_water", "road_damage", "pothole",
  "traffic", "accident", "closure_notice", "clear", "other",
] as const;
export const STATUSES = ["open", "slow", "one_lane", "closed", "unknown"] as const;

export const Claim = z.object({
  eventType: z.enum(EVENT_TYPES),
  status: z.enum(STATUSES),
  passable: z.object({ bike: z.boolean().nullable(), car: z.boolean().nullable(), bus: z.boolean().nullable() }),
  measurements: z.object({
    blockedLengthM: range.nullable(),
    roadWidthLeftM: range.nullable(),
    blockedPct: range.nullable(),
    vehiclesVisible: z.number().int().nullable(),
  }),
  crowd: z.enum(["low", "medium", "high"]).nullable(),
  /** True if this claim is about the spot where the photo was taken; false for other places the voice note/text mentions. */
  atReportLocation: z.boolean(),
  /** Place named in the voice note/text for claims not at the report location, e.g. "Darlaghat". */
  placeHint: z.string().nullable(),
  summary: z.string().describe("one plain-English sentence for travellers"),
  summaryHi: z.string().describe("the same sentence in Hindi (Devanagari)"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe("short: which evidence supports this"),
});
export type Claim = z.infer<typeof Claim>;

export const ClaimSet = z.object({
  /** Usually one claim; a voice note can describe several places. The photo's own claim comes first. */
  claims: z.array(Claim).min(1).max(5),
});
export type ClaimSet = z.infer<typeof ClaimSet>;

export const Verdict = z.object({
  verdict: z.enum(["accept", "pending", "reject"]),
  /** Does the photo independently support the claim's type and status? */
  agrees: z.boolean(),
  confidence: z.number().min(0).max(1),
  /** Only set when the verifier thinks the claim got it wrong. */
  correctedStatus: z.enum(STATUSES).nullable(),
  correctedEventType: z.enum(EVENT_TYPES).nullable(),
  reasoning: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

/** OpenAI-style `response_format` for Chat Completions. */
export function jsonSchemaFormat(name: string, schema: z.ZodType) {
  const json = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
  delete json.$schema;
  return { type: "json_schema" as const, json_schema: { name, schema: json } };
}

/** Parse + validate a model reply. Tolerates a ```json fence. */
export function parseJson<T>(schema: z.ZodType<T>, text: string | null | undefined): T | null {
  if (!text) return null;
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const r = schema.safeParse(JSON.parse(body));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Route Check agent (Phase 2)

export const RouteVerdict = z.object({
  verdict: z.enum(["go", "go_with_care", "delay", "avoid"]),
  /** One short line, e.g. "Leave by 4:00 AM" or "Go now — one lane at Aut, ~20 min wait". */
  headline: z.string(),
  headlineHi: z.string().describe("the headline in simple Hindi (Devanagari)"),
  disruptions: z.array(
    z.object({
      eventId: z.string(),
      order: z.number().int(),
      etaAtSegment: z.string().describe("ISO time you reach it"),
      impact: z.string().describe("short, e.g. 'one lane, ~20 min wait; clears ~1–2 PM'"),
    }),
  ),
  /** Departure / route options (What-If). One must be recommended. */
  options: z
    .array(
      z.object({
        label: z.string().describe("e.g. 'Leave now', 'Leave 4 AM', 'Via NH-3 (avoid Kataula)'"),
        departAt: z.string().describe("ISO"),
        arriveAt: z.string().describe("ISO"),
        viaRoad: z.string().nullable(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        recommended: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
  reasoning: z.string().describe("2–4 short sentences: why, naming the evidence"),
  usedSources: z.array(z.string()).describe("e.g. 'traveller reports (9)', 'Open-Meteo forecast', 'PWD update'"),
});
export type RouteVerdict = z.infer<typeof RouteVerdict>;

// ---------------------------------------------------------------- Nearby (Phase 3)

export const NearbySummary = z.object({
  summary: z.string().describe("1–2 short sentences, plain English"),
  summaryHi: z.string().describe("the same in simple Hindi (Devanagari)"),
});
export type NearbySummary = z.infer<typeof NearbySummary>;

// ---------------------------------------------------------------- News ingest (Phase 3)

export const NewsItem = z.object({
  placeName: z.string(),
  district: z.string().nullable(),
  roadRef: z.string().nullable().describe("e.g. NH-3, NH-205, SH-?; null if not given"),
  roadName: z.string().nullable().describe("e.g. Chandigarh-Manali Highway"),
  eventType: z.enum(EVENT_TYPES),
  status: z.enum(STATUSES),
  reopened: z.boolean(),
  publishedAt: z.string().nullable(),
  sourceUrl: z.string(),
  sourceTitle: z.string().nullable(),
  summary: z.string(),
  summaryHi: z.string(),
  confidence: z.number().min(0).max(1),
});
export type NewsItem = z.infer<typeof NewsItem>;

export const NewsItems = z.object({ items: z.array(NewsItem).max(12) });
export type NewsItems = z.infer<typeof NewsItems>;

// ---------------------------------------------------------------- Command Centre (Phase 4)

/** What the Crew Dispatch agent submits; vehicle-hours are recomputed in code from these steps. */
export const DispatchProposal = z.object({
  steps: z
    .array(
      z.object({
        crewId: z.string(),
        eventId: z.string(),
        action: z.enum(["keep", "send", "send_later"]).describe("keep = stay on the current job; send = go now; send_later = go after something (rain, another job)"),
        when: z.string().describe('short timing in IST, e.g. "now", "after Aut clears (~2 PM)", "after the rain (~4 PM)"'),
        text: z.string().describe("one plain sentence for the official, e.g. 'Send Crew B to Kataula now — fully closed, no detour.'"),
      }),
    )
    .min(1)
    .max(8),
  headline: z.string().describe("one line, e.g. 'Clear Kataula first, keep Aut going'"),
  headlineHi: z.string().describe("the same in simple Hindi (Devanagari)"),
  reasoning: z.string().describe("2–3 short sentences: why this order, naming the evidence"),
});
export type DispatchProposal = z.infer<typeof DispatchProposal>;

export const Advisory = z.object({
  en: z.string().describe("public advisory in English, 1–2 sentences, at most 220 characters"),
  hi: z.string().describe("the same advisory in simple Hindi (Devanagari)"),
});
export type Advisory = z.infer<typeof Advisory>;

// ---------------------------------------------------------------- Investigator (Phase 5)

/** What the Investigator submits. Code decides what changes (it never sets an event's status). */
export const Investigation = z.object({
  finding: z
    .enum(["still_there", "likely_changed", "likely_cleared", "conflicting", "no_new_evidence"])
    .describe("still_there = evidence says the event is as shown; likely_changed = status probably different now; likely_cleared = probably open again; conflicting = sources disagree; no_new_evidence = nothing to go on"),
  suggestedStatus: z.enum(STATUSES).nullable().describe("only when finding is likely_changed / likely_cleared"),
  confidence: z.number().min(0).max(1).describe("how likely the event, as currently shown, is right NOW"),
  explanation: z.string().describe("1–2 short sentences for travellers: what the evidence says and how fresh it is"),
  explanationHi: z.string().describe("the same in simple Hindi (Devanagari)"),
  evidence: z.array(z.string()).max(6).describe("short lines, each naming its source and time, e.g. 'PWD update 2 h ago: 70% cleared'"),
  scoutQuestion: z.string().nullable().describe("if a fresh photo would settle it: one short question for a traveller nearby, else null"),
});
export type Investigation = z.infer<typeof Investigation>;

// ---------------------------------------------------------------- Slope Sentinel (Phase 6B)

export const SLOPE_SIGN_KINDS = [
  "tension_crack", "wall_crack", "wall_bulge", "seepage", "fresh_rockfall", "leaning_trees",
  "fresh_scar", "undercut_toe", "loose_overhang", "other",
] as const;
export const SLOPE_OVERALL = ["none", "minor", "concerning", "severe"] as const;

/** What a model reads from a photo of the hillside above a road (warning signs, not a prediction). */
export const SlopeReading = z.object({
  /** False for a road surface, selfie, sky, … → the observation is rejected. */
  isSlopePhoto: z.boolean(),
  signs: z
    .array(
      z.object({
        kind: z.enum(SLOPE_SIGN_KINDS),
        severity: z.enum(["minor", "moderate", "major"]),
        looksFresh: z.boolean().nullable(),
        aboveRoad: z.boolean().nullable(),
        note: z.string().describe("short: where in the photo and what it looks like"),
      }),
    )
    .max(8),
  overall: z.enum(SLOPE_OVERALL),
  confidence: z.number().min(0).max(1),
  summary: z.string().describe("one plain-English sentence"),
  summaryHi: z.string().describe("the same sentence in Hindi (Devanagari)"),
  reasoning: z.string(),
});
export type SlopeReading = z.infer<typeof SlopeReading>;

/** Independent second look at a SlopeReading. */
export const SlopeCheck = z.object({
  verdict: z.enum(["agree", "downgrade", "reject"]),
  /** Only for "downgrade": the level the checker would give instead. */
  correctedOverall: z.enum(SLOPE_OVERALL).nullable(),
  /** Sign kinds from the reading the checker could not see in the photo. */
  disputedSigns: z.array(z.enum(SLOPE_SIGN_KINDS)).max(8),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type SlopeCheck = z.infer<typeof SlopeCheck>;

export const SLOPE_RISK_LEVELS = ["none", "watch", "elevated", "high"] as const;

/** Slope risk agent output (code then applies caps before it is stored). */
export const SlopeRisk = z.object({
  level: z.enum(SLOPE_RISK_LEVELS),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1).max(5).describe("short evidence lines a traveller can check"),
  advice: z.string().describe("one or two sentences for travellers: when to cross, where not to stop"),
  adviceHi: z.string().describe("the same advice in Hindi (Devanagari)"),
  recheckInHours: z.number().min(1).max(72),
});
export type SlopeRisk = z.infer<typeof SlopeRisk>;

// ---------------------------------------------------------------- Vehicle fit (Phase 6C)

export const VEHICLE_CATEGORIES = ["bike", "small_car", "hatch_sedan", "suv", "mpv", "van", "pickup", "bus", "truck"] as const;
export const FIT_VERDICTS = ["fits", "tight", "wont_fit", "unknown"] as const;

/** What a model sees in a photo of the traveller's own vehicle. Real dimensions come from the spec table, not from this. */
export const VehicleId = z.object({
  isVehicle: z.boolean(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  category: z.enum(VEHICLE_CATEGORIES),
  /** One of the ids given in the prompt, or null when the model isn't in the list. */
  matchedVehicleId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  roofLoad: z.boolean(),
  roofLoadHeightM: z.object({ min: z.number(), max: z.number() }).nullable(),
  extras: z.array(z.string()).max(6).describe("e.g. roof carrier, bike rack, wide mirrors, trailer, lowered"),
  loadedHeavily: z.boolean().nullable(),
});
export type VehicleId = z.infer<typeof VehicleId>;

export const FIT_FACTOR_KINDS = ["width", "ground_clearance", "surface", "edge_drop", "overhead", "length_turning", "water", "other"] as const;

/** Side-by-side reading of the road photo(s) + the vehicle, written by one model. */
export const FitAssessment = z.object({
  factors: z
    .array(z.object({ kind: z.enum(FIT_FACTOR_KINDS), verdict: z.enum(["ok", "caution", "problem", "unknown"]), detail: z.string() }))
    .min(1)
    .max(7),
  /** The model's view; code only lets it LOWER the code verdict. */
  suggestedVerdict: z.enum(FIT_VERDICTS),
  overallAdvice: z.string().describe("2–3 short practical sentences"),
  // Checked in code, not as a JSON-schema pattern (a pattern steers constrained decoding into a 1-letter answer).
  overallAdviceHi: z
    .string()
    .refine((s) => (s.match(/[ऀ-ॿ]/g)?.length ?? 0) >= 15, "must be Hindi in Devanagari script")
    .describe("the same advice in simple Hindi, Devanagari script"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type FitAssessment = z.infer<typeof FitAssessment>;

/** Independent check of a FitAssessment by a second model. */
export const FitCheck = z.object({
  verdict: z.enum(["agree", "adjust", "disagree"]),
  suggestedVerdict: z.enum(FIT_VERDICTS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type FitCheck = z.infer<typeof FitCheck>;
