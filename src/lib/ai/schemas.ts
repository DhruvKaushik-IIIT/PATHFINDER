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
