// Phase 0: which provider can transcribe a Hindi voice note?
//  A. Meta Muse Voice Transcribe, language auto-detect
//  B. Meta Muse Voice Transcribe, languageBias=hindi + place-name keywords
//  C. Baseten Spark Open with audio input (chat completions `input_audio`)
//  D. Meta muse-spark-1.2 with audio input (CLAUDE.md: better audio than 1.3)
// Voice follows cookbook 06_muse_voice/01. C/D use the OpenAI `input_audio` part (no recipe exists).
// Run: pnpm test:voice [audio]   (default data/seed/voice/hindi-note-1.m4a; needs ffmpeg)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { hasKey, MODELS, type Provider } from "../src/lib/ai/clients.ts";
import { classifyError, InvalidOutputError, runJob, usageFromChat } from "../src/lib/ai/router.ts";
import { transcribeWav } from "../src/lib/ai/voice.ts";

const input = process.argv[2] ?? "data/seed/voice/hindi-note-1.m4a";
mkdirSync("out/voice", { recursive: true });
const wavPath = `out/voice/${path.parse(input).name}.wav`;
// Mono, 16-bit, 24 kHz WAV — what the voice endpoint wants.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", wavPath]);
const wav = readFileSync(wavPath);
const seconds = (wav.length - 44) / (24000 * 2);
console.log(`audio: ${input} → ${wavPath} · ${seconds.toFixed(1)} s`);

const KEYWORDS = ["Mandi", "Kullu", "Manali", "Aut", "Pandoh", "NH-3", "Atal Tunnel", "Sissu", "JCB", "landslide"];

async function voice(label: string, opts: { languageBias?: string[]; keywords?: string[] }) {
  const t0 = Date.now();
  try {
    const r = await transcribeWav(wav, opts);
    console.log(`\n── ${label} · ${Date.now() - t0} ms · ~$${((seconds / 3600) * 0.18).toFixed(4)}`);
    console.log(r.transcript || "(empty transcript)");
  } catch (err) {
    const e = classifyError(err);
    console.log(`\n── ${label} · FAILED ${e.kind}${e.status ? ` ${e.status}` : ""} — ${e.message}`);
  }
}

const SPARK_PROMPT = `This is a voice note from a traveller about a road in Himachal Pradesh, probably in Hindi.
Reply in exactly two lines:
TRANSCRIPT: <exact words in the original language and script (Devanagari for Hindi)>
ENGLISH: <English translation>`;

async function sparkAudio(label: string, provider: Provider, model: string) {
  const t0 = Date.now();
  const r = await runJob<string | null>({
    purpose: "test-voice",
    attempts: [
      {
        provider,
        model,
        kind: "agent",
        run: async (c) => {
          const res = await c.chat.completions.create({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: SPARK_PROMPT },
                  { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } },
                ],
              },
            ],
          });
          const text = res.choices[0]?.message?.content?.trim();
          if (!text) throw new InvalidOutputError("empty reply");
          return { data: text, usage: usageFromChat(res) };
        },
      },
    ],
    mock: () => "(mock)",
    lastResort: () => null,
  });
  console.log(`\n── ${label} · ${Date.now() - t0} ms`);
  console.log(r.data ?? `FAILED: ${r.degraded}`);
}

if (hasKey("meta")) {
  await voice("A · Meta Voice Transcribe (auto-detect)", {});
  await voice("B · Meta Voice Transcribe (languageBias=hindi + keywords)", { languageBias: ["hindi"], keywords: KEYWORDS });
}
if (hasKey("baseten")) await sparkAudio("C · Baseten Spark Open (audio input)", "baseten", MODELS.sparkOpen);
if (hasKey("meta")) await sparkAudio("D · Meta Spark 1.2 (audio input)", "meta", MODELS.spark12);
