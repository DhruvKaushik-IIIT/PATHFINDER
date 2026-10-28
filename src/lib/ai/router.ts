// Server-only: the ONE place AI providers are called from (CLAUDE.md 5.7).
// Pages and API routes call job functions exported here, never a client directly.
// Rules: retry 429/5xx/timeouts twice with backoff, trip a 10-minute circuit
// breaker on auth/billing errors, fall back to the next provider, and never throw.
import type OpenAI from "openai";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { insert, hasDb } from "../db/supabase.ts";
import { client, hasKey, MODELS, type Provider } from "./clients.ts";
import { segmentImage, type SamResult } from "./sam.ts";

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

/** Throw this from an attempt when the model replied but the output is unusable (e.g. failed zod). */
export class InvalidOutputError extends Error {}

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
}

function logCall(entry: CallLog): void {
  console.info("[ai]", JSON.stringify(entry));
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
        logCall({
          at: new Date().toISOString(), purpose: opts.purpose, provider: a.provider, model: a.model,
          inputTokens: 0, outputTokens: 0, costUsd: null, latencyMs: Date.now() - started,
          ok: false, fallbackUsed, errorKind: e.kind,
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

// TODO(phase-1): writeClaim(), verifyClaim(), transcribe()
// TODO(phase-2): routeCheck()
