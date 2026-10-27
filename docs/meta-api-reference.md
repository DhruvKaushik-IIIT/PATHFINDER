# Meta Model API — Reference for Pathfinder

Compiled 26 Oct 2026 from dev.meta.ai docs + meta-model-cookbook README.
Put this file in `docs/` so Claude Code uses the real API format instead of guessing.

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL | `https://api.meta.ai/v1` |
| Auth | `Authorization: Bearer $MODEL_API_KEY` |
| Env var | `MODEL_API_KEY` (format: `LLM|{numeric_id}|{secret}`) |
| Dashboard / keys | https://dev.meta.ai → API keys → Create API key |
| SDK | **OpenAI SDK** works as-is: `pip install openai` / `npm install openai` |
| Protocols | Responses API, Chat Completions (OpenAI-compatible), Messages (Anthropic-compatible) |

⚠️ The OpenAI SDK does **not** auto-read `MODEL_API_KEY` — pass it explicitly.
⚠️ Never commit the key. Keep it in `.env` and add `.env` to `.gitignore` (repo must be public).

```python
import os
from openai import OpenAI

client = OpenAI(base_url="https://api.meta.ai/v1", api_key=os.environ["MODEL_API_KEY"])
resp = client.responses.create(model="muse-spark-1.3", input="Hello!")
print(resp.output_text)
```

Common errors: `401 invalid_api_key` (bad/missing key) · `404 model_not_found` (wrong model ID).

---

## 2. Models (exact IDs)

| Model | ID | Input → Output | Notes |
|---|---|---|---|
| Muse Spark 1.3 | `muse-spark-1.3` | text, image, video, audio, PDF → text | Recommended workhorse. Tool calling, structured output, reasoning effort. 1M context |
| Muse Spark 1.3 Contributor | `muse-spark-1.3-contributor` | same | ~12× cheaper, but **your content may train Meta models**. No `max` reasoning |
| Muse Spark 1.2 | `muse-spark-1.2` | same | **Better for audio** than 1.3 (1.3 audio is "not fully supported") |
| Muse Wonder | `muse-wonder-1.0` | text, image, video, audio, PDF → text | Frontier reasoning + long agentic tasks. Reasoning effort `minimal`→`max`. Preview |
| Muse Image | `muse-image-1.0` | text, image → image | Generation + editing |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | audio → transcript | WebSocket streaming or single HTTP upload (not via OpenAI SDK). Hindi support not stated — test it |
| SAM 3.1 | `sam-3.1` | text prompt + image/video → boxes + masks | Via `meta-sam` package (Python/TS) |
| Muse Spark Open | — | text, image, video, audio → text | **NOT on Model API.** Open weights (816B MoE, 42B active) — use Baseten/Modal/Fireworks |
| Muse Glimmer | — | text (+ tools) → text | **NOT on Model API.** 30B, runs locally; needs a 24–32 GB GPU (quantized). Vision not yet supported |

---

## 3. Pricing (per 1M tokens unless stated)

| Model | Input | Cached input | Output |
|---|---|---|---|
| Muse Wonder | $4.00 | $0.20 | $20.00 |
| Muse Spark (standard) | $1.25 | $0.15 | $4.25 |
| Muse Spark (contributor) | $0.10 | $0.002 | $0.20 |

| Other | Price |
|---|---|
| SAM 3.1 (images) | $2.50 / 1,000 images |
| SAM 3.1 (video) | $0.20 / 1,000 frames (50-frame minimum) |
| Muse Image | $0.01 / image |
| Voice Transcribe | $0.18 / hour of audio |
| Web search grounding | $2.50 / 1,000 searches (+ tokens) |

### Rough cost per Pathfinder action
| Action | Approx cost |
|---|---|
| SAM segmentation of one photo | ~$0.0025 |
| Spark reads photo + writes structured report (~2k in / 0.5k out) | ~$0.005 |
| Verifier check (Spark, ~3k in / 0.5k out) | ~$0.006 |
| 30-sec Hindi voice note | ~$0.0015 |
| Route Check with Muse Wonder (~20k in / 3k out incl. reasoning) | ~$0.15 |

**$150 ≈ ~1,000 Route Checks or ~10,000+ photo reports.** Plenty for a 10-day build.
Tip: use the contributor model for bulk testing with your own sample data; use standard for anything involving real users' photos.

---

## 4. Rate limits (per team)

| Model | RPM | TPM |
|---|---|---|
| Muse Wonder | 3,000 | 4M |
| Muse Spark (standard) | 3,000 | 4M |
| Muse Spark (contributor) | 150 | 3M |
| SAM 3.1 | 3,000 | — |
| Muse Image | 150 | — |
| Voice Transcribe | 256 concurrent streams | — |

---

## 5. Capabilities Pathfinder uses

| Capability | Where in Pathfinder | Cookbook recipe |
|---|---|---|
| Vision input (URL or base64) | Read road/trek photos | `01_api_fundamentals/07` |
| Structured output (schema-guaranteed JSON) | Ingest + Verifier output claims/events | `01/04`, `02_agent_patterns/05` |
| Tool calling (execute → feed back loop) | Route Check + Road Watch agents | `01/03`, `02/02` |
| Agent loop (perceive → decide → act) | Road Watch monitoring | `02/01`, `02/03` |
| **Search grounding (live web + citations)** | Ingest news/closures for cold start; Route Check context | `01/10` |
| Reasoning effort control | Wonder for Route Check, low effort for bulk Spark | `01/06` |
| Prompt caching | Reuse long system prompts cheaply | `01/05` |
| Error handling (retry + backoff) | All API calls | `01/09` |
| Speech-to-text | Hindi voice notes | `06_muse_voice/01` |
| SAM image segmentation | Measure debris/snow/vehicles | `07_sam/01` |
| Perception grounding (overlay on image) | Draw SAM masks on the report photo | `03_use_cases/10` |

---

## 6. Recipes to read first (in order)
1. `01_api_fundamentals/01` chat completions — first call
2. `01/07` vision input
3. `01/04` structured output
4. `07_sam/01` SAM API basics
5. `01/03` tool calling → `02_agent_patterns/01` basic agent loop
6. `01/10` search grounding
7. `06_muse_voice/01` speech to text

Cookbook: https://github.com/meta-models/meta-model-cookbook

---

## 7. Hackathon-specific notes
- $150 Meta credits are active on the account (spend alert at $120). No card linked yet — whether Meta requires one is tested in Phase 0 (`hello-meta`). If calls fail with a payment error, the app falls back to Baseten (see CLAUDE.md 5.7).
- Baseten: $100 credits approved, endpoint `https://inference.baseten.co/v1`, OpenAI Chat Completions, key `BASETEN_API_KEY`.
- Baseten model ID for the hackathon: `meta-models/muse-spark-open-1026` (not `muse-spark-open`).
- Open-weights bonus prize needs Muse Spark Open or Muse Glimmer — realistically via Baseten/Modal.
- Muse Code CLI (optional): `curl -fsSL https://dev.meta.ai/install.sh | sh` then `muse`.
