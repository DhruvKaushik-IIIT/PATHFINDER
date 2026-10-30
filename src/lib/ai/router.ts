// Server-only: the ONE place AI providers are called from (CLAUDE.md 5.7).
// Pages and API routes call job functions exported here, never a client directly.
// Rules: retry 429/5xx/timeouts twice with backoff, trip a 10-minute circuit
// breaker on auth/billing errors, fall back to the next provider, and never throw.
import type OpenAI from "openai";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { insert, hasDb } from "../db/supabase.ts";
import { noteSpend, overBudget } from "./budget.ts";
import { client, hasKey, MODELS, type Provider } from "./clients.ts";
import { readFileSync } from "node:fs";
import { CLAIM_SYSTEM, claimUserText } from "./prompts/claim.ts";
import { VERIFY_SYSTEM, verifyUserText } from "./prompts/verify.ts";
import { segmentImage, type SamResult } from "./sam.ts";
import { ROUTE_CHECK_SYSTEM, routeCheckUserText } from "./prompts/routeCheck.ts";
import { NEARBY_SYSTEM, nearbyUserText } from "./prompts/nearby.ts";
import { NEWS_PARSE_SYSTEM, newsParseUserText, newsSearchPrompt } from "./prompts/news.ts";
import { ADVISORY_SYSTEM, advisoryUserText } from "./prompts/advisory.ts";
import { DISPATCH_SYSTEM, dispatchUserText } from "./prompts/dispatch.ts";
import { INVESTIGATE_SYSTEM, investigateUserText } from "./prompts/investigate.ts";
import { SLOPE_CHECK_SYSTEM, SLOPE_SYSTEM, slopeCheckUserText, slopeUserText } from "./prompts/slope.ts";
import { SLOPE_RISK_SYSTEM, slopeRiskUserText } from "./prompts/slopeRisk.ts";
import { runSlopeTool, SLOPE_TOOLS, type SlopeToolContext } from "./tools/slope.ts";
import { SlopeCheck, SlopeReading, SlopeRisk, FitAssessment, FitCheck, VehicleId } from "./schemas.ts";
import { VEHICLE_SYSTEM, vehicleUserText } from "./prompts/vehicle.ts";
import { FIT_CHECK_SYSTEM, FIT_SYSTEM, fitCheckUserText, fitUserText } from "./prompts/fit.ts";
import { Advisory, ClaimSet, DispatchProposal, Investigation, jsonSchemaFormat, NearbySummary, NewsItems, parseJson, RouteVerdict, Verdict, type Claim } from "./schemas.ts";
import { DISPATCH_TOOLS, runDispatchTool, type DispatchContext } from "./tools/dispatch.ts";
import { INVESTIGATE_TOOLS, runInvestigateTool, type InvestigateContext } from "./tools/investigate.ts";
import { ist, ROUTE_CHECK_TOOLS, runRouteCheckTool, type RouteCheckContext } from "./tools/routeCheck.ts";
import { z } from "zod";
import { transcribeWav } from "./voice.ts";

// ---------------------------------------------------------------- mode

export type AiMode = "live" | "mock";

/** AI_MODE=mock → fixtures only, no network. Anything else (default "auto") → live routing. */
export function aiMode(): AiMode {
  return process.env.AI_MODE === "mock" ? "mock" : "live";
}

// ---------------------------------------------------------------- circuit breaker

export type ProviderHealth = "ok" | "down" | "unknown";

const DOWN_MS = 10 * 60_000;

// In-memory, per server instance. Good enough for a hackathon; a cold start resets it.
const breaker: Record<Provider, { downUntil: number; lastOkAt: number; reason?: string }> = {
  meta: { downUntil: 0, lastOkAt: 0 },
  baseten: { downUntil: 0, lastOkAt: 0 },
};

export function markDown(provider: Provider, reason: string): void {
  const b = breaker[provider];
  if (Date.now() >= b.downUntil) {
    // Log once per trip, not on every skipped call.
    console.warn(`[ai] ${provider} marked down for 10 min: ${reason}`);
  }
  b.downUntil = Date.now() + DOWN_MS;
  b.reason = reason;
}

export function isDown(provider: Provider): boolean {
  return Date.now() < breaker[provider].downUntil;
}

function markOk(provider: Provider): void {
  breaker[provider].lastOkAt = Date.now();
  breaker[provider].downUntil = 0;
  breaker[provider].reason = undefined;
}

export function providerHealth(provider: Provider): ProviderHealth {
  if (!hasKey(provider) || isDown(provider)) return "down";
  return breaker[provider].lastOkAt > 0 ? "ok" : "unknown";
}

export function downReason(provider: Provider): string | undefined {
  if (!hasKey(provider)) return "no API key configured";
  return isDown(provider) ? breaker[provider].reason : undefined;
}

// ---------------------------------------------------------------- error classification

export type ErrorKind =
  | "no_key"
  | "auth_or_billing" // 401/402/403 or payment/billing/credit/quota → trip breaker, no retry
  | "rate_limited" // 429 → retry
  | "server" // 5xx → retry
  | "timeout" // → retry
  | "connection" // → retry
  | "bad_request" // other 4xx → no retry, try next provider
  | "invalid_output" // model replied but output failed validation
  | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  status?: number;
  retry: boolean;
  tripBreaker: boolean;
  message: string;
}

const BILLING_RE = /payment|billing|credit|quota/i;

export function classifyError(err: unknown): ClassifiedError {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  if (err instanceof APIConnectionTimeoutError) {
    return { kind: "timeout", retry: true, tripBreaker: false, message };
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return { kind: "timeout", retry: true, tripBreaker: false, message }; // fetch + AbortSignal.timeout
  }
  if (err instanceof APIConnectionError) {
    return { kind: "connection", retry: true, tripBreaker: false, message };
  }
  // OpenAI SDK errors, or our own fetch-based errors that carry an HTTP `status` (e.g. voice.ts).
  const httpStatus =
    err instanceof APIError ? err.status : (err as { status?: unknown } | null)?.status;
  if (err instanceof APIError || typeof httpStatus === "number") {
    const status = httpStatus as number | undefined;
    if (status === 401 || status === 402 || status === 403 || BILLING_RE.test(message)) {
      return { kind: "auth_or_billing", status, retry: false, tripBreaker: true, message };
    }
    if (status === 429) return { kind: "rate_limited", status, retry: true, tripBreaker: false, message };
    if (status !== undefined && status >= 500) {
      return { kind: "server", status, retry: true, tripBreaker: false, message };
    }
    return { kind: "bad_request", status, retry: false, tripBreaker: false, message };
  }
  if (err instanceof InvalidOutputError) {
    return { kind: "invalid_output", retry: false, tripBreaker: false, message };
  }
  return { kind: "unknown", retry: false, tripBreaker: false, message };
}

/** Throw this from an attempt when the model replied but the output is unusable (e.g. failed zod).
 *  Pass the tokens already spent so ai_calls still records the cost of the failed attempt. */
export class InvalidOutputError extends Error {
  readonly usage?: Usage;
  constructor(message: string, usage?: Usage) {
    super(message);
    this.usage = usage;
  }
}

// ---------------------------------------------------------------- cost + logging

interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

// USD per 1M tokens (CLAUDE.md 5.4). Baseten pricing is billed separately → null for now.
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  [MODELS.spark]: { input: 1.25, cached: 0.15, output: 4.25 },
  [MODELS.spark12]: { input: 1.25, cached: 0.15, output: 4.25 },
  [MODELS.sparkContributor]: { input: 0.1, cached: 0.002, output: 0.2 },
  [MODELS.wonder]: { input: 4.0, cached: 0.2, output: 20.0 },
};

export function estimateCost(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens);
  return (uncached * p.input + u.cachedInputTokens * p.cached + u.outputTokens * p.output) / 1_000_000;
}

export function usageFromChat(r: OpenAI.Chat.Completions.ChatCompletion): Usage {
  return {
    inputTokens: r.usage?.prompt_tokens ?? 0,
    cachedInputTokens: r.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: r.usage?.completion_tokens ?? 0,
  };
}

interface CallLog {
  at: string;
  purpose: string;
  provider: Provider | "mock";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
  fallbackUsed: boolean;
  errorKind?: ErrorKind;
  /** HTTP status of a failed provider call (logs only). */
  status?: number;
}

function logCall(entry: CallLog): void {
  noteSpend(entry.costUsd);
  // Structured line for Vercel logs: provider, model, purpose, tokens, cost, error kind — never keys or photos.
  if (entry.ok) console.info("[ai]", JSON.stringify(entry));
  else console.warn("[ai]", JSON.stringify({ level: "warn", event: "ai_call_failed", ...entry }));
  if (!hasDb()) return;
  // Fire-and-forget: a logging failure must never break the job.
  insert("ai_calls", {
    at: entry.at, purpose: entry.purpose, provider: entry.provider, model: entry.model,
    input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, cost_usd: entry.costUsd,
    latency_ms: entry.latencyMs, ok: entry.ok, fallback_used: entry.fallbackUsed, error_kind: entry.errorKind ?? null,
  }).catch((err: unknown) => console.warn("[ai] ai_calls insert failed:", (err as Error).message));
}

// ---------------------------------------------------------------- job runner

export interface Attempt<T> {
  provider: Provider;
  model: string;
  kind?: "text" | "agent";
  /** costUsd overrides the token-based estimate (per-image pricing, e.g. SAM). */
  run: (c: OpenAI) => Promise<{ data: T; usage?: Usage; costUsd?: number }>;
}

export interface JobResult<T> {
  ok: true;
  data: T;
  source: Provider | "mock" | "none";
  model?: string;
  /** Set when the primary provider failed or no AI ran. Safe to show in a toast. */
  degraded?: string;
}

const RETRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Try each attempt in order (primary → fallbacks), then the no-AI last resort.
 * Never throws: every failure path ends in `lastResort`.
 */
export async function runJob<T>(opts: {
  purpose: string;
  attempts: Attempt<T>[];
  mock: () => T;
  lastResort: (reason: string) => T;
}): Promise<JobResult<T>> {
  if (aiMode() === "mock") {
    logCall({
      at: new Date().toISOString(), purpose: opts.purpose, provider: "mock", model: "fixture",
      inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0, ok: true, fallbackUsed: false,
    });
    return { ok: true, data: opts.mock(), source: "mock" };
  }

  // Global daily spend cap (Phase 6D): straight to the no-AI last resort, never an error.
  const capped = await overBudget();
  if (capped) {
    console.warn(JSON.stringify({ level: "warn", event: "ai_budget_cap", purpose: opts.purpose }));
    return { ok: true, data: opts.lastResort(capped), source: "none", degraded: capped };
  }

  const reasons: string[] = [];

  for (const [i, a] of opts.attempts.entries()) {
    const fallbackUsed = i > 0;
    if (!hasKey(a.provider)) {
      reasons.push(`${a.provider}: no_key`);
      continue;
    }
    if (isDown(a.provider)) {
      reasons.push(`${a.provider}: down (${breaker[a.provider].reason ?? "circuit open"})`);
      continue;
    }

    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const started = Date.now();
      try {
        const { data, usage, costUsd } = await a.run(client(a.provider, a.kind));
        const u = usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
        markOk(a.provider);
        logCall({
          at: new Date().toISOString(), purpose: opts.purpose, provider: a.provider, model: a.model,
          inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: costUsd ?? estimateCost(a.model, u),
          latencyMs: Date.now() - started, ok: true, fallbackUsed,
        });
        return {
          ok: true, data, source: a.provider, model: a.model,
          degraded: fallbackUsed ? `fallback used (${reasons.join("; ")})` : undefined,
        };
      } catch (err) {
        const e = classifyError(err);
        const spent = err instanceof InvalidOutputError ? err.usage : undefined;
        logCall({
          at: new Date().toISOString(), purpose: opts.purpose, provider: a.provider, model: a.model,
          inputTokens: spent?.inputTokens ?? 0, outputTokens: spent?.outputTokens ?? 0,
          costUsd: spent ? estimateCost(a.model, spent) : null, latencyMs: Date.now() - started,
          ok: false, fallbackUsed, errorKind: e.kind, ...(e.status && { status: e.status }),
        });
        if (e.tripBreaker) markDown(a.provider, `${e.kind}${e.status ? ` ${e.status}` : ""}: ${e.message}`);
        if (e.retry && attempt < RETRIES) {
          await sleep(500 * 2 ** attempt + Math.random() * 300);
          continue;
        }
        reasons.push(`${a.provider}: ${e.kind}${e.status ? ` ${e.status}` : ""} — ${e.message}`);
        break;
      }
    }
  }

  const reason = reasons.join("; ") || "no provider available";
  return { ok: true, data: opts.lastResort(reason), source: "none", degraded: reason };
}

// ---------------------------------------------------------------- jobs

/** Tiny connectivity check used by scripts/hello-*.ts. Returns null data if the provider failed. */
export function sayHello(provider: Provider): Promise<JobResult<string | null>> {
  const model = provider === "meta" ? MODELS.spark : MODELS.sparkOpen;
  return runJob<string | null>({
    purpose: "hello",
    attempts: [
      {
        provider,
        model,
        run: async (c) => {
          const r = await c.chat.completions.create({
            model,
            messages: [{ role: "user", content: "Reply with exactly: Namaste from Himachal" }],
          });
          const text = r.choices[0]?.message?.content?.trim();
          if (!text) throw new InvalidOutputError("empty reply");
          return { data: text, usage: usageFromChat(r) };
        },
      },
    ],
    mock: () => "Namaste from Himachal (mock)",
    lastResort: () => null,
  });
}

export const SAM_COST_PER_IMAGE = 0.0025;

/**
 * SAM 3.1 on one photo for one short concept ("road", "face", ...). Meta only, no AI fallback:
 * data is null when SAM is unavailable, and the caller applies the no-AI rule from 5.7
 * ("measurement unavailable" / keep the photo private until blurred).
 */
export function segment(jpeg: Buffer, concept: string): Promise<JobResult<SamResult | null>> {
  return runJob<SamResult | null>({
    purpose: `sam:${concept}`,
    attempts: [
      {
        provider: "meta",
        model: MODELS.sam,
        kind: "agent",
        run: async () => ({ data: await segmentImage(jpeg, concept), costUsd: SAM_COST_PER_IMAGE }),
      },
    ],
    // Mock: "nothing found" — measurements come out empty, privacy pass treats the photo as clean.
    mock: () => ({ concept, boxes: [], masks: [] }),
    lastResort: () => null,
  });
}

// ---------------------------------------------------------------- helpers for JSON jobs

type ChatContent = OpenAI.Chat.Completions.ChatCompletionContentPart[];

/**
 * One structured-output chat call (cookbook 01/04: response_format json_schema), zod-validated.
 * Invalid JSON → retried once inside the attempt (6.2 rule 1), then InvalidOutputError → next provider.
 */
async function chatJson<T>(
  c: OpenAI,
  provider: Provider,
  model: string,
  opts: { name: string; schema: z.ZodType<T>; system: string; content: ChatContent; effort?: "minimal" | "low" | "medium" | "high" },
): Promise<{ data: T; usage: Usage }> {
  const total: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await c.chat.completions.create({
      model,
      messages: [
        // Meta wants the `developer` role for instructions; Baseten takes the classic `system`.
        { role: provider === "meta" ? "developer" : "system", content: opts.system },
        { role: "user", content: opts.content },
      ],
      response_format: jsonSchemaFormat(opts.name, opts.schema),
      reasoning_effort: opts.effort ?? "low",
    });
    const u = usageFromChat(r);
    total.inputTokens += u.inputTokens;
    total.cachedInputTokens += u.cachedInputTokens;
    total.outputTokens += u.outputTokens;
    const data = parseJson(opts.schema, r.choices[0]?.message?.content);
    if (data) return { data, usage: total };
  }
  throw new InvalidOutputError(`${opts.name}: reply failed schema validation twice`);
}

/** Fixtures for AI_MODE=mock (data/seed/mocks/<name>.json). */
function fixture<T>(name: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(`${process.cwd()}/data/seed/mocks/${name}.json`, "utf8")));
}

const imagePart = (jpeg: Buffer): OpenAI.Chat.Completions.ChatCompletionContentPartImage => ({
  type: "image_url",
  image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
});

// ---------------------------------------------------------------- claim + verify

export type ClaimInput = Parameters<typeof claimUserText>[0] & { jpeg: Buffer };

/** Photo (+ SAM, voice, text) → claims. Baseten Spark Open first, Meta Spark fallback; null = save as pending. */
export function writeClaim(input: ClaimInput): Promise<JobResult<ClaimSet | null>> {
  const content: ChatContent = [{ type: "text", text: claimUserText(input) }, imagePart(input.jpeg)];
  const attempt = (provider: Provider, model: string): Attempt<ClaimSet | null> => ({
    provider,
    model,
    run: (c) => chatJson(c, provider, model, { name: "claims", schema: ClaimSet, system: CLAIM_SYSTEM, content }),
  });
  return runJob<ClaimSet | null>({
    purpose: "write_claim",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: () => fixture("claims", ClaimSet),
    lastResort: () => null,
  });
}

export interface VerifyOutcome {
  verdict: Verdict;
  /** "rules" when no AI could verify. */
  by: Provider | "mock" | "rules";
}

/**
 * Independent second opinion on the photo's claim. Meta Spark first (a different model from the
 * claim writer → "2 AI models agree"), Baseten fallback, rule-based last resort.
 */
export async function verifyClaim(jpeg: Buffer, claim: Claim, context: string): Promise<JobResult<VerifyOutcome>> {
  const content: ChatContent = [{ type: "text", text: verifyUserText(claim, context) }, imagePart(jpeg)];
  const attempt = (provider: Provider, model: string): Attempt<VerifyOutcome> => ({
    provider,
    model,
    run: async (c) => {
      const { data, usage } = await chatJson(c, provider, model, { name: "verdict", schema: Verdict, system: VERIFY_SYSTEM, content });
      return { data: { verdict: data, by: provider }, usage };
    },
  });
  return runJob<VerifyOutcome>({
    purpose: "verify_claim",
    attempts: [attempt("meta", MODELS.spark), attempt("baseten", MODELS.sparkOpen)],
    mock: () => ({ verdict: fixture("verdict", Verdict), by: "mock" }),
    // No AI: trust a confident claim provisionally, never more than "pending" for weak ones.
    lastResort: () => ({
      by: "rules",
      verdict: {
        verdict: claim.confidence >= 0.6 && claim.status !== "unknown" ? "accept" : "pending",
        agrees: false,
        confidence: Math.min(claim.confidence, 0.5),
        correctedStatus: null,
        correctedEventType: null,
        reasoning: "AI verifier unavailable — rule-based check only.",
      },
    }),
  });
}

// ---------------------------------------------------------------- voice

export interface Transcript {
  text: string;
  by: Provider | "mock";
}

const AUDIO_PROMPT =
  "Transcribe the attached voice note exactly, in the language spoken (Hindi in Devanagari). " +
  "If there is no intelligible speech, set hasSpeech=false and transcript to an empty string. Reply with JSON only.";
const AudioTranscript = z.object({ hasSpeech: z.boolean(), transcript: z.string() });

/** WAV → transcript. Muse Voice Transcribe (auto-detect, best for Hindi in Phase 0) → Baseten audio input → null. */
export function transcribe(wav: Buffer): Promise<JobResult<Transcript | null>> {
  const VOICE_COST_PER_SEC = 0.18 / 3600;
  return runJob<Transcript | null>({
    purpose: "transcribe",
    attempts: [
      {
        provider: "meta",
        model: MODELS.voice,
        run: async () => {
          const r = await transcribeWav(wav);
          if (!r.transcript?.trim()) throw new InvalidOutputError("empty transcript");
          return {
            data: { text: r.transcript.trim(), by: "meta" },
            costUsd: ((r.audioDurationMs ?? 0) / 1000) * VOICE_COST_PER_SEC,
          };
        },
      },
      {
        provider: "baseten",
        model: MODELS.sparkOpen,
        // Structured, so a refusal or "no speech" can't leak in as a transcript.
        run: async (c) => {
          const { data, usage } = await chatJson(c, "baseten", MODELS.sparkOpen, {
            name: "transcript",
            schema: AudioTranscript,
            system: AUDIO_PROMPT,
            content: [{ type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } }],
          });
          if (!data.hasSpeech || !data.transcript.trim()) throw new InvalidOutputError("no speech in audio");
          return { data: { text: data.transcript.trim(), by: "baseten" }, usage };
        },
      },
    ],
    mock: () => ({ text: "औट के पास पहाड़ से पत्थर गिरे हैं, एक लेन खुली है।", by: "mock" }),
    lastResort: () => null,
  });
}
// ---------------------------------------------------------------- nearby summary (Phase 3)

/** Ranked events around a place → 1–2 sentences EN + HI. Baseten → Meta Spark → template from code. */
export function nearbySummary(
  input: Parameters<typeof nearbyUserText>[0],
  template: () => NearbySummary,
): Promise<JobResult<NearbySummary>> {
  const content: ChatContent = [{ type: "text", text: nearbyUserText(input) }];
  const attempt = (provider: Provider, model: string): Attempt<NearbySummary> => ({
    provider,
    model,
    run: (c) => chatJson(c, provider, model, { name: "nearby_summary", schema: NearbySummary, system: NEARBY_SYSTEM, content }),
  });
  return runJob<NearbySummary>({
    purpose: "nearby_summary",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: template,
    lastResort: template,
  });
}

// ---------------------------------------------------------------- news ingest (Phase 3)

export const SEARCH_COST = 0.0025; // per web search (5.4)

export interface GroundedDigest {
  text: string;
  /** Every page the model cited or opened — the only URLs a news item may point at. */
  sources: { url: string; title: string | null }[];
  searches: number;
}

/**
 * Search grounding (cookbook 01/10): Meta Spark + the built-in web_search tool on the Responses API.
 * Meta only (Baseten has no search). null → skip this ingest run.
 */
export function searchRoadNews(nowIst: string): Promise<JobResult<GroundedDigest | null>> {
  return groundedSearch(newsSearchPrompt(nowIst), "news_search");
}

/** One grounded web search (Meta Spark + web_search). Used by news ingest and the Investigator. */
export function groundedSearch(prompt: string, purpose: string, contextSize: "low" | "medium" = "medium"): Promise<JobResult<GroundedDigest | null>> {
  const model = MODELS.spark;
  return runJob<GroundedDigest | null>({
    purpose,
    attempts: [
      {
        provider: "meta",
        model,
        kind: "agent",
        run: async (c) => {
          const r = await c.responses.create({
            model,
            input: prompt,
            tools: [{ type: "web_search", search_context_size: contextSize }],
            reasoning: { effort: "low" },
          });
          const usage: Usage = {
            inputTokens: r.usage?.input_tokens ?? 0,
            cachedInputTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0,
            outputTokens: r.usage?.output_tokens ?? 0,
          };
          const sources = new Map<string, string | null>();
          let searches = 0;
          for (const item of r.output) {
            if (item.type === "web_search_call") {
              const action = (item as { action?: { type?: string; url?: string } }).action;
              if (action?.type === "search") searches++;
              if (action?.type === "open_page" && action.url && !sources.has(action.url)) sources.set(action.url, null);
            }
            if (item.type === "message") {
              for (const block of item.content) {
                if (block.type !== "output_text") continue;
                for (const a of block.annotations ?? []) if (a.type === "url_citation") sources.set(a.url, a.title ?? null);
              }
            }
          }
          // Only the final answer: earlier message items are "I'll search…" narration.
          const messages = r.output.filter((i) => i.type === "message");
          const last = messages[messages.length - 1];
          const text = last?.type === "message" ? last.content.map((b) => (b.type === "output_text" ? b.text : "")).join("") : "";
          if (!text.trim()) throw new InvalidOutputError("empty grounded answer", usage);
          return {
            data: { text, sources: [...sources].map(([url, title]) => ({ url, title })), searches },
            usage,
            costUsd: (estimateCost(model, usage) ?? 0) + searches * SEARCH_COST,
          };
        },
      },
    ],
    mock: () => null,
    lastResort: () => null,
  });
}

/** Grounded digest → structured items. Baseten Spark Open → Meta Spark (a second model reads the first one's digest). */
export function parseRoadNews(input: Parameters<typeof newsParseUserText>[0]): Promise<JobResult<NewsItems | null>> {
  const content: ChatContent = [{ type: "text", text: newsParseUserText(input) }];
  const attempt = (provider: Provider, model: string): Attempt<NewsItems | null> => ({
    provider,
    model,
    run: (c) => chatJson(c, provider, model, { name: "news_items", schema: NewsItems, system: NEWS_PARSE_SYSTEM, content }),
  });
  return runJob<NewsItems | null>({
    purpose: "news_parse",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: () => ({ items: [] }),
    lastResort: () => null,
  });
}

// ---------------------------------------------------------------- agents (tool-calling loop)

type Effort = "minimal" | "low" | "medium" | "high";

export interface AgentOutput<T> {
  data: T;
  /** Tool calls made, in order (shown in "why" UI / logs). */
  trace: string[];
  turns: number;
}

/**
 * Generic tool loop (cookbook 01/03): call → run every tool_call → feed results back → repeat.
 * The agent ends by calling the `submit` tool, whose arguments are validated with zod (invalid →
 * the error goes back to the model to fix). tool_choice must be "auto" on Meta.
 */
async function agentLoop<T>(
  c: OpenAI,
  provider: Provider,
  model: string,
  opts: {
    system: string;
    user: string;
    tools: OpenAI.Chat.Completions.ChatCompletionTool[];
    exec: (name: string, args: string) => Promise<unknown>;
    submit: { name: string; schema: z.ZodType<T> };
    maxTurns: number;
    effort: Effort;
  },
): Promise<{ data: AgentOutput<T>; usage: Usage }> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: provider === "meta" ? "developer" : "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const usage: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  const trace: string[] = [];
  let nudged = false;

  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    const r = await c.chat.completions.create({
      model,
      messages,
      tools: opts.tools,
      tool_choice: "auto",
      reasoning_effort: opts.effort,
    });
    const u = usageFromChat(r);
    usage.inputTokens += u.inputTokens;
    usage.cachedInputTokens += u.cachedInputTokens;
    usage.outputTokens += u.outputTokens;

    const msg = r.choices[0]?.message;
    const calls = (msg?.tool_calls ?? []).filter((tc) => tc.type === "function");
    if (!msg || !calls.length) {
      // Some turns answer with the verdict as plain JSON instead of the tool: accept it if it validates.
      const asText = parseJson(opts.submit.schema, msg?.content);
      if (asText) return { data: { data: asText, trace: [...trace, `${opts.submit.name} (as text)`], turns: turn }, usage };
      if (nudged) break;
      nudged = true;
      messages.push({ role: "assistant", content: msg?.content ?? "" });
      messages.push({ role: "user", content: `Now call ${opts.submit.name} with your final answer.` });
      continue;
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

    let submitted: T | null = null;
    const results = await Promise.all(
      calls.map(async (tc) => {
        const { name, arguments: args } = tc.function;
        trace.push(name === opts.submit.name ? name : `${name}(${args.length > 80 ? `${args.slice(0, 80)}…` : args})`);
        if (name !== opts.submit.name) return { id: tc.id, content: JSON.stringify(await opts.exec(name, args)).slice(0, 12_000) };
        const parsed = (() => {
          try {
            return opts.submit.schema.safeParse(JSON.parse(args));
          } catch {
            return null;
          }
        })();
        if (parsed?.success) {
          submitted = parsed.data;
          return { id: tc.id, content: "ok" };
        }
        const issues = parsed ? parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "not valid JSON";
        return { id: tc.id, content: JSON.stringify({ error: `invalid ${opts.submit.name}: ${issues}. Fix and call it again.` }) };
      }),
    );
    if (submitted !== null) return { data: { data: submitted, trace, turns: turn }, usage };
    for (const res of results) messages.push({ role: "tool", tool_call_id: res.id, content: res.content });
  }
  throw new InvalidOutputError(`agent ended without a valid ${opts.submit.name}`, usage);
}

export interface RouteCheckOutput {
  verdict: RouteVerdict;
  by: Provider | "mock" | "code";
  trace: string[];
}

/**
 * Route Check agent (6.4). tier "wonder" (several events / a closure): Meta Muse Wonder → Baseten Spark Open.
 * tier "spark" (one event): Baseten Spark Open → Meta Spark. Last resort: the code-built verdict.
 */
export function routeCheck(
  ctx: RouteCheckContext,
  tier: "spark" | "wonder",
  codeVerdict: () => RouteVerdict,
): Promise<JobResult<RouteCheckOutput>> {
  const user = routeCheckUserText({
    from: ctx.plan.from.name,
    to: ctx.plan.to.name,
    departAt: ist(ctx.plan.departAt),
    now: ist(new Date()),
  });
  const attempt = (provider: Provider, model: string, effort: Effort): Attempt<RouteCheckOutput> => ({
    provider,
    model,
    kind: "agent",
    run: async (c) => {
      const { data, usage } = await agentLoop(c, provider, model, {
        system: ROUTE_CHECK_SYSTEM,
        user,
        tools: ROUTE_CHECK_TOOLS,
        exec: (name, args) => runRouteCheckTool(ctx, name, args),
        submit: { name: "submit_verdict", schema: RouteVerdict },
        maxTurns: 6,
        effort,
      });
      return { data: { verdict: data.data, by: provider, trace: data.trace }, usage };
    },
  });
  const attempts =
    tier === "wonder"
      ? [attempt("meta", MODELS.wonder, "medium"), attempt("baseten", MODELS.sparkOpen, "medium")]
      : [attempt("baseten", MODELS.sparkOpen, "low"), attempt("meta", MODELS.spark, "low")];
  return runJob<RouteCheckOutput>({
    purpose: `route_check:${tier}`,
    attempts,
    mock: () => ({ verdict: codeVerdict(), by: "mock", trace: [] }),
    lastResort: () => ({ verdict: codeVerdict(), by: "code", trace: [] }),
  });
}

// ---------------------------------------------------------------- Command Centre (Phase 4)

export interface DispatchOutput {
  proposal: DispatchProposal | null;
  by: Provider | "mock" | "code";
  trace: string[];
}

/**
 * Crew Dispatch agent (6.4): Meta Muse Wonder (medium effort) → Baseten Spark Open with the same tools.
 * Last resort: null proposal → the caller shows the code plan. Vehicle-hours are recomputed in code.
 */
export function crewDispatch(ctx: DispatchContext, org: string): Promise<JobResult<DispatchOutput>> {
  const user = dispatchUserText({ org, district: ctx.district.name, now: ist(new Date()) });
  const attempt = (provider: Provider, model: string): Attempt<DispatchOutput> => ({
    provider,
    model,
    kind: "agent",
    run: async (c) => {
      const { data, usage } = await agentLoop(c, provider, model, {
        system: DISPATCH_SYSTEM,
        user,
        tools: DISPATCH_TOOLS,
        exec: (name, args) => runDispatchTool(ctx, name, args),
        submit: { name: "submit_plan", schema: DispatchProposal },
        maxTurns: 6,
        effort: "medium",
      });
      return { data: { proposal: data.data, by: provider, trace: data.trace }, usage };
    },
  });
  return runJob<DispatchOutput>({
    purpose: "crew_dispatch",
    attempts: [attempt("meta", MODELS.wonder), attempt("baseten", MODELS.sparkOpen)],
    mock: () => ({ proposal: null, by: "mock", trace: [] }),
    lastResort: () => ({ proposal: null, by: "code", trace: [] }),
  });
}

/** Verified event → public advisory EN + HI. Baseten → Meta Spark → template from code. */
export function draftAdvisory(input: Parameters<typeof advisoryUserText>[0], template: () => Advisory): Promise<JobResult<Advisory>> {
  const content: ChatContent = [{ type: "text", text: advisoryUserText(input) }];
  const attempt = (provider: Provider, model: string): Attempt<Advisory> => ({
    provider,
    model,
    run: (c) => chatJson(c, provider, model, { name: "advisory", schema: Advisory, system: ADVISORY_SYSTEM, content }),
  });
  return runJob<Advisory>({
    purpose: "advisory_draft",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: template,
    lastResort: template,
  });
}

export interface InvestigateOutput {
  /** null → no AI answer (both providers down); the caller writes a rule-based note. */
  findings: Investigation | null;
  by: Provider | "mock" | "code";
  trace: string[];
}

/** Investigator agent (6.4, Spark tier): Baseten Spark Open → Meta Spark, low effort. Never throws. */
export function investigate(ctx: InvestigateContext, reason: string): Promise<JobResult<InvestigateOutput>> {
  const user = investigateUserText({ eventId: ctx.event.id, reason, now: ist(new Date()) });
  const attempt = (provider: Provider, model: string): Attempt<InvestigateOutput> => ({
    provider,
    model,
    kind: "agent",
    run: async (c) => {
      const { data, usage } = await agentLoop(c, provider, model, {
        system: INVESTIGATE_SYSTEM,
        user,
        tools: INVESTIGATE_TOOLS,
        exec: (name, args) => runInvestigateTool(ctx, name, args),
        submit: { name: "submit_findings", schema: Investigation },
        maxTurns: 7,
        effort: "low",
      });
      return { data: { findings: data.data, by: provider, trace: data.trace }, usage };
    },
  });
  return runJob<InvestigateOutput>({
    purpose: "investigate",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: () => ({ findings: null, by: "mock", trace: [] }),
    lastResort: () => ({ findings: null, by: "code", trace: [] }),
  });
}

// ---------------------------------------------------------------- Slope Sentinel (Phase 6B)

export interface SlopeReadOutput {
  reading: SlopeReading;
  by: Provider | "mock";
}

/** Hillside photo (+ SAM boxes) → SlopeReading. Baseten Spark Open → Meta Spark → null (= pending review). */
export function readSlope(input: Parameters<typeof slopeUserText>[0] & { jpeg: Buffer }): Promise<JobResult<SlopeReadOutput | null>> {
  const content: ChatContent = [{ type: "text", text: slopeUserText(input) }, imagePart(input.jpeg)];
  const attempt = (provider: Provider, model: string): Attempt<SlopeReadOutput | null> => ({
    provider,
    model,
    run: async (c) => {
      const { data, usage } = await chatJson(c, provider, model, { name: "slope_reading", schema: SlopeReading, system: SLOPE_SYSTEM, content });
      return { data: { reading: data, by: provider }, usage };
    },
  });
  return runJob<SlopeReadOutput | null>({
    purpose: "read_slope",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: () => ({ reading: fixture("slope-reading", SlopeReading), by: "mock" }),
    lastResort: () => null,
  });
}

export interface SlopeCheckOutput {
  check: SlopeCheck;
  by: Provider | "mock" | "rules";
}

/** Independent second look. Meta Spark → Baseten → rule-based (never raises, never confirms a weak reading). */
export function checkSlope(jpeg: Buffer, reading: SlopeReading, context: string): Promise<JobResult<SlopeCheckOutput>> {
  const content: ChatContent = [{ type: "text", text: slopeCheckUserText(reading, context) }, imagePart(jpeg)];
  const attempt = (provider: Provider, model: string): Attempt<SlopeCheckOutput> => ({
    provider,
    model,
    run: async (c) => {
      const { data, usage } = await chatJson(c, provider, model, { name: "slope_check", schema: SlopeCheck, system: SLOPE_CHECK_SYSTEM, content });
      return { data: { check: data, by: provider }, usage };
    },
  });
  return runJob<SlopeCheckOutput>({
    purpose: "check_slope",
    attempts: [attempt("meta", MODELS.spark), attempt("baseten", MODELS.sparkOpen)],
    mock: () => ({ check: { verdict: "agree", correctedOverall: null, disputedSigns: [], confidence: 0.8, reasoning: "mock" }, by: "mock" }),
    // No AI: a non-slope photo is rejected; severe readings are held at "concerning" until a model checks them.
    lastResort: () => ({
      by: "rules",
      check: {
        verdict: !reading.isSlopePhoto ? "reject" : reading.overall === "severe" ? "downgrade" : "agree",
        correctedOverall: reading.overall === "severe" ? "concerning" : null,
        disputedSigns: [],
        confidence: Math.min(reading.confidence, 0.5),
        reasoning: "Second AI check unavailable — rule-based check only.",
      },
    }),
  });
}

export interface SlopeRiskOutput {
  risk: SlopeRisk | null;
  by: Provider | "mock" | "code";
  trace: string[];
}

/** Slope risk agent: Meta Muse Wonder (low) → Baseten Spark Open → null (the caller uses the code matrix). */
export function assessSlopeRisk(ctx: SlopeToolContext, trigger: string): Promise<JobResult<SlopeRiskOutput>> {
  const user = slopeRiskUserText({ siteId: ctx.site.id, place: ctx.site.place_name, now: ist(new Date()), trigger });
  const attempt = (provider: Provider, model: string): Attempt<SlopeRiskOutput> => ({
    provider,
    model,
    kind: "agent",
    run: async (c) => {
      const { data, usage } = await agentLoop(c, provider, model, {
        system: SLOPE_RISK_SYSTEM,
        user,
        tools: SLOPE_TOOLS,
        exec: (name) => runSlopeTool(ctx, name),
        submit: { name: "submit_risk", schema: SlopeRisk },
        maxTurns: 6,
        effort: "low",
      });
      return { data: { risk: data.data, by: provider, trace: data.trace }, usage };
    },
  });
  return runJob<SlopeRiskOutput>({
    purpose: "slope_risk",
    attempts: [attempt("meta", MODELS.wonder), attempt("baseten", MODELS.sparkOpen)],
    mock: () => ({ risk: null, by: "mock", trace: [] }),
    lastResort: () => ({ risk: null, by: "code", trace: [] }),
  });
}

// ---------------------------------------------------------------- Vehicle fit (Phase 6C)

/** Photo of the traveller's own vehicle (privacy-blurred) → VehicleId. Baseten → Meta Spark → null (ask the user to pick). */
export function identifyVehicle(jpeg: Buffer, list: { id: string; name: string }[]): Promise<JobResult<{ id: VehicleId; by: Provider | "mock" } | null>> {
  const content: ChatContent = [{ type: "text", text: vehicleUserText(list) }, imagePart(jpeg)];
  const attempt = (provider: Provider, model: string): Attempt<{ id: VehicleId; by: Provider | "mock" } | null> => ({
    provider,
    model,
    run: async (c) => {
      const { data, usage } = await chatJson(c, provider, model, { name: "vehicle", schema: VehicleId, system: VEHICLE_SYSTEM, content });
      return { data: { id: data, by: provider }, usage };
    },
  });
  return runJob({
    purpose: "identify_vehicle",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: () => ({
      id: { isVehicle: true, make: "Toyota", model: "Innova Crysta", category: "mpv", matchedVehicleId: "toyota-innova-crysta", confidence: 0.8, roofLoad: false, roofLoadHeightM: null, extras: [], loadedHeavily: null },
      by: "mock",
    }),
    lastResort: () => null,
  });
}

/** ONE multi-image call: road photo(s) + vehicle photo + code numbers → FitAssessment. Baseten → Meta Spark → null (code only). */
export function assessFit(roadJpegs: Buffer[], vehicleJpeg: Buffer | null, facts: unknown): Promise<JobResult<{ a: FitAssessment; by: Provider | "mock" } | null>> {
  const content: ChatContent = [{ type: "text", text: fitUserText(facts) }, ...roadJpegs.map(imagePart), ...(vehicleJpeg ? [imagePart(vehicleJpeg)] : [])];
  const attempt = (provider: Provider, model: string): Attempt<{ a: FitAssessment; by: Provider | "mock" } | null> => ({
    provider,
    model,
    run: async (c) => {
      const { data, usage } = await chatJson(c, provider, model, { name: "fit_assessment", schema: FitAssessment, system: FIT_SYSTEM, content });
      return { data: { a: data, by: provider }, usage };
    },
  });
  return runJob({
    purpose: "assess_fit",
    attempts: [attempt("baseten", MODELS.sparkOpen), attempt("meta", MODELS.spark)],
    mock: () => null,
    lastResort: () => null,
  });
}

/** Independent check by a different model (Meta Spark → Baseten). null → "1 model". */
export function checkFit(roadJpegs: Buffer[], vehicleJpeg: Buffer | null, assessment: FitAssessment, facts: unknown, avoid: Provider | "mock"): Promise<JobResult<{ c: FitCheck; by: Provider | "mock" } | null>> {
  const content: ChatContent = [{ type: "text", text: fitCheckUserText(assessment, facts) }, ...roadJpegs.map(imagePart), ...(vehicleJpeg ? [imagePart(vehicleJpeg)] : [])];
  const attempt = (provider: Provider, model: string): Attempt<{ c: FitCheck; by: Provider | "mock" } | null> => ({
    provider,
    model,
    run: async (c) => {
      const { data, usage } = await chatJson(c, provider, model, { name: "fit_check", schema: FitCheck, system: FIT_CHECK_SYSTEM, content });
      return { data: { c: data, by: provider }, usage };
    },
  });
  // The checker must be a DIFFERENT model from the writer, else it isn't a second opinion.
  const attempts = [attempt("meta", MODELS.spark), attempt("baseten", MODELS.sparkOpen)].filter((a) => a.provider !== avoid);
  return runJob({ purpose: "check_fit", attempts, mock: () => null, lastResort: () => null });
}

export const IMAGE_COST = 0.01; // Muse Image per image (5.4)

/** Alert-card illustration (Muse Image via the Responses API, cookbook 05/01). null → the caller draws one in code. */
export function alertArt(prompt: string): Promise<JobResult<Buffer | null>> {
  const model = MODELS.image;
  return runJob<Buffer | null>({
    purpose: "alert_art",
    attempts: [
      {
        provider: "meta",
        model,
        kind: "agent", // image renders take longer than a text call
        run: async (c) => {
          const r = await c.responses.create({ model, input: prompt });
          const usage: Usage = {
            inputTokens: r.usage?.input_tokens ?? 0,
            cachedInputTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0,
            outputTokens: r.usage?.output_tokens ?? 0,
          };
          const item = r.output.find((i) => i.type === "image_generation_call") as { result?: string | null } | undefined;
          if (!item?.result) throw new InvalidOutputError("no image in the response", usage);
          return { data: Buffer.from(item.result, "base64"), usage, costUsd: IMAGE_COST };
        },
      },
    ],
    mock: () => null,
    lastResort: () => null,
  });
}
