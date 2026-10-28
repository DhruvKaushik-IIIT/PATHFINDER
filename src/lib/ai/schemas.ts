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
