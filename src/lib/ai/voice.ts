// Server-only: Muse Voice Transcribe, one-shot HTTP endpoint.
// Follows cookbook 06_muse_voice/01 (transcribe_file.py): multipart POST with a JSON
// "request" part + the audio part; mono 16-bit WAV (24 kHz native, 16 kHz accepted).
// Not via the OpenAI SDK. Caps: 10 min of audio or 32 MB.
import { MODELS } from "./clients.ts";

export const TRANSCRIBE_URL = "https://api.meta.ai/v1/asr/transcribe";
const MAX_BYTES = 32 * 1024 * 1024;

export interface TranscribeResult {
  transcript: string;
  audioDurationMs?: number;
  sessionId?: string;
  turns?: { transcript?: string; startMs?: number; speaker?: string }[];
}

/** Error carrying the HTTP status so the router's classifier can treat it like an SDK error. */
export class VoiceHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function transcribeWav(
  wav: Buffer,
  opts: { languageBias?: string[]; keywords?: string[]; timeoutMs?: number } = {},
): Promise<TranscribeResult> {
  if (wav.length > MAX_BYTES) throw new Error(`audio is ${(wav.length / 1048576).toFixed(1)} MB; limit is 32 MB`);
  const request: Record<string, unknown> = { mode: "PUSH_TO_TALK", model: MODELS.voice, audioEncoding: "WAV" };
  if (opts.keywords?.length) request.keywords = opts.keywords;
  if (opts.languageBias?.length) request.languageBias = opts.languageBias;

  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "note.wav");

  const res = await fetch(TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY ?? ""}` },
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new VoiceHttpError(res.status, `${res.status} ${body}`);
  }
  return (await res.json()) as TranscribeResult;
}
