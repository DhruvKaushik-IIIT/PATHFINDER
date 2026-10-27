// Server-only: provider clients. Never import this from a client component —
// the keys below must stay on the server.
import OpenAI from "openai";

export type Provider = "meta" | "baseten";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const BASETEN_BASE_URL = "https://inference.baseten.co/v1";

export const MODELS = {
  spark: "muse-spark-1.3",
  sparkContributor: "muse-spark-1.3-contributor",
  spark12: "muse-spark-1.2",
  wonder: "muse-wonder-1.0",
  image: "muse-image-1.0",
  voice: "muse-voice-transcribe-1.0",
  sam: "sam-3.1",
  sparkOpen: "meta-models/muse-spark-open-1026", // Baseten only
} as const;

export function hasKey(provider: Provider): boolean {
  const v = provider === "meta" ? process.env.MODEL_API_KEY : process.env.BASETEN_API_KEY;
  return typeof v === "string" && v.length > 0;
}

// Retries are handled by the router (backoff + fallback), so the SDK's own
// retries are off. Timeouts follow CLAUDE.md 5.7: 30 s text, 60 s agents.
function make(baseURL: string, apiKey: string | undefined, timeoutMs: number): OpenAI {
  return new OpenAI({ baseURL, apiKey: apiKey || "missing", timeout: timeoutMs, maxRetries: 0 });
}

const cache = new Map<string, OpenAI>();

export function client(provider: Provider, kind: "text" | "agent" = "text"): OpenAI {
  const key = `${provider}:${kind}`;
  let c = cache.get(key);
  if (!c) {
    const timeout = kind === "agent" ? 60_000 : 30_000;
    c =
      provider === "meta"
        ? make(META_BASE_URL, process.env.MODEL_API_KEY, timeout)
        : make(BASETEN_BASE_URL, process.env.BASETEN_API_KEY, timeout);
    cache.set(key, c);
  }
  return c;
}
