# CLAUDE.md — Pathfinder (Meta Global AI Developer Hackathon)

> Read this whole file at the start of every session. It is the single source of truth for this project.

---

## ⛔ 0. HOW TO WORK — PHASE GATING (MOST IMPORTANT RULE)

This project is built **one phase at a time**. The developer (Dhruv) has limited usage and coursework, so:

1. **Build ONLY the current phase.** The current phase is the first phase in the **Phase Tracker (section 14)** that is not marked ✅.
2. **When this file is first attached / a session starts:** do NOT write code yet. Reply with:
   - a 3–5 line summary of the project,
   - which phase is current,
   - the task list for that phase,
   - then ask: **"Shall I start Phase N?"** and wait.
3. **Never start the next phase on your own.** Only start a phase when the user says something like "start phase 2", "next phase", or "go".
4. **Never build features from later phases early**, even if "it would be quick". If something from a later phase is needed as a stub, create a clearly marked placeholder (`// TODO(phase-4): …`) and nothing more.
5. **Work in small steps inside a phase:** do one task → run it / test it → show the result → continue. Do not write huge amounts of code in one go.
6. **At the end of a phase:**
   - list what was built and how to test it (exact commands + what to click),
   - list anything that didn't work or was cut,
   - suggest a git commit message,
   - update the Phase Tracker in this file (mark ✅ and add notes),
   - then STOP and wait. Suggest the user runs `/clear` before the next phase.
7. **Ask before:** adding a new dependency not listed here, changing the database schema beyond this file, deleting files, or spending noticeable API credits (e.g. batch-running AI over many photos).
8. **Secrets:** never print, log, hardcode or commit API keys. Never ask the user to paste a key into chat. In a **cloud session** keys come from the cloud environment's *Environment variables* (`process.env`); on a **local Mac** they live in `.env.local` (git-ignored). Never `echo`/`cat`/`printenv` them; to check one exists, print only `set`/`missing`.
9. **PARTS inside a phase.** Every phase below is split into **Part A / B / C**. After each Part: run/test it → `git commit` + `git push` → reply with a short report (what works, how to check it, anything broken) → ask **"Continue to Part X?"** and WAIT. Never do two Parts in one go. If the user says "continue", do the next Part only.
10. **Usage limits:** if a session is about to end or context is getting long, stop at the end of the current task, commit + push, and write a 3-line "where I stopped" note in the Phase Tracker so the next session can resume.

## 0.5 Where this runs
- Usually a **Claude Code cloud session** on the GitHub repo `DhruvKaushik-IIIT/PATHFINDER` (environment `meta_hackathon`). Sometimes a local session on Dhruv's Mac.
- Cloud sessions work on a **branch** and push it; tell the user when a PR is ready to merge into `main` (they merge on GitHub). Never force-push `main`.
- The user cannot open your `localhost`. To show UI: start the dev server and take **Playwright screenshots** at 390×844 (Chromium is pre-installed), and describe what you see. The user can also `git pull` + `npm run dev` on the Mac, or check the Vercel preview (after Phase 6, or earlier if they connect Vercel).
- Files the user gives you (road photos, the Hindi voice clip) arrive as **chat attachments** → copy them into `data/seed/` (strip EXIF first).
- If a network request fails with a proxy/403 error, the domain probably isn't allowed in the environment's Network access. Tell the user exactly which domain to add (see section 16). Don't try workarounds.

---

## 1. Project summary

**Pathfinder** — live, AI-verified road & trek conditions for Himachal Pradesh, India.

- **Problem:** landslides, snow and tourist jams close or choke mountain roads (e.g. Mandi–Kullu NH-3, Atal Tunnel). People rely on scattered WhatsApp forwards and find out a road is closed only when they reach it. Google Maps shows *that* traffic is slow, not *why*, not trek conditions, and is weak on remote stretches.
- **Solution:** anyone posts a photo (+ optional Hindi voice note) in 5 seconds. Meta's AI measures, verifies and turns it into a structured road event. Agents plan trips around disruptions, watch saved trips, and help officials decide which slide to clear first.
- **It is an agentic road-intelligence system, NOT a "simple image analyzer"** (that is a banned hackathon category). Photos are only one evidence source among many; the value is verification, reasoning, prediction and action.

**Four modes**
| Mode | Who | What |
|---|---|---|
| 📸 Report | People at the incident | Photo/video/voice → AI report → verified event |
| 🧭 Journey | Travellers going A → B | Every disrupted patch on the route, details, verdict, What-If, Road Watch |
| 📍 Nearby | People at a place | Everything within a radius (5/10/25/50 km), ranked |
| 🏛️ Command Centre | Govt / PWD / road crews (invite-only accounts) | Priority queue, crew dispatch, field updates, public advisories |

**Demo region:** the **Mandi → Aut → Kullu → Manali → Atal Tunnel → Sissu** corridor (NH-3) plus nearby roads and treks. The architecture must work for all of Himachal Pradesh.

---

## 2. Hackathon facts & rules (must respect)

- Event: Meta Global AI Developer Hackathon (Cerebral Valley). **Indie Developer track**, solo.
- Build window: **Oct 27 → Nov 4, 9:00 PM ET** (= **Thu Nov 5, 7:30 AM IST**). Plan to submit **Wed Nov 4 night IST**.
- **Repo must be public** → never commit secrets.
- **New work only:** everything is built during the event. Keep commits frequent and honest.
- **Must use Meta models** (Meta Model API and/or Meta open-weight models). Stage 1 judging is pass/fail on this.
- Submission: **3-minute demo video** + public repo + live product. The demo must only show features built during the hackathon.
- Judging (equal weight, 0–10): **Impact · Use of Meta AI Tooling · Technical Depth & Execution · Demo.**
- Bonus prizes worth targeting: **Best Agentic Use-Case** (Route Check / Road Watch / Investigator), **Best Build on Meta Open-Weight Models** (Muse Spark Open via Baseten), **Community Vote**, **Most Viral**.
- Anti-projects to stay clear of: simple image analyzers, basic RAG apps, medical advice, sports coaches, political content. → Always present Pathfinder as an agentic, multi-source verification + planning system.

---

## 3. Tech stack (use exactly this unless the user approves a change)

| Layer | Choice |
|---|---|
| App | **Next.js 15 (App Router) + TypeScript**, deployed on **Vercel** |
| Styling | **Tailwind CSS** + a small set of custom glass utilities (section 7) |
| Map rendering | **MapLibre GL JS** (`maplibre-gl`, via `react-map-gl/maplibre`) |
| Map tiles | **OpenFreeMap** vector tiles (free, no key): style `https://tiles.openfreemap.org/styles/liberty` (fallback: `…/styles/positron`). Custom-style it to the Glass look (section 7.6) |
| Road data | **OpenStreetMap** via **Overpass API** (one-time download, saved as GeoJSON in `data/`) |
| Geo math | **Turf.js** (`@turf/turf`): segmenting, nearest-point snapping, distances, radius |
| Routing A→B | **OSRM** public demo server `https://router.project-osrm.org` (demo use only, cache results). Optional fallback: OpenRouteService (needs key) |
| Place search | **Photon** geocoder `https://photon.komoot.io/api/?q=…&lat=31.7&lon=76.9&bbox=68,6,98,37` (free, no key, OSM data). Search all of **India** (so "Delhi", "Chandigarh", "Pathankot" work) but bias results toward Himachal with `lat/lon`. Plus our own `data/places.json` for treks, passes and villages Photon misses. Debounce typing (300 ms) and cache. |
| Weather | **Open-Meteo** (free, no key) |
| Database / storage / auth | **Supabase** (Postgres + **PostGIS**, Storage for photos, Auth for official accounts) |
| Image processing | **sharp** (resize, strip EXIF, blur regions, draw annotation overlays) |
| AI | **OpenAI SDK** pointed at the **Meta Model API** (section 5); `meta-sam` package for SAM 3.1; Muse Voice Transcribe via its WebSocket/HTTP API |
| Open-weight model | **Muse Spark Open** on **Baseten** (OpenAI-compatible) — primary for text/vision jobs (5.7) |
| Background jobs | Vercel Cron (or Supabase scheduled functions) for Road Watch / ingest / re-verification |
| Validation | **zod** for every AI JSON output and API input |

Package manager: **pnpm** (or npm if pnpm is not installed — ask once).

---

## 4. Repository layout (target)

```
pathfinder/
├─ CLAUDE.md
├─ README.md
├─ .env.example            # names only, no values
├─ .env.local              # real keys (git-ignored)
├─ docs/
│  ├─ meta-api-reference.md   # Meta API facts (given by Dhruv)
│  └─ demo-script.md          # Phase 7
├─ vendor/meta-model-cookbook/  # git clone, read-only reference (git-ignored or submodule)
├─ data/
│  ├─ hp-roads.geojson        # OSM roads for Himachal (Phase 0)
│  ├─ segments.geojson        # ~1 km segments (Phase 0)
│  ├─ places.json             # named places + treks with coords
│  └─ seed/                   # sample photos + seed events (demo data)
├─ scripts/                # one-off scripts (hello-meta, fetch-roads, seed, ...)
├─ src/
│  ├─ app/                 # Next.js routes (pages + /api)
│  ├─ components/glass/    # Glass UI kit (Sheet, GlassButton, Pill, Card, ...)
│  ├─ components/map/      # MapView, layers, pins
│  ├─ lib/ai/              # meta client, prompts, schemas, agents, sam, voice
│  ├─ lib/geo/             # segments, snapping, routing, radius
│  ├─ lib/db/              # supabase client, queries
│  └─ lib/images/          # resize, exif strip, blur, annotate
└─ supabase/migrations/    # SQL migrations
```

---

## 5. Meta Model API — everything needed to connect

Full notes: `docs/meta-api-reference.md`. Code recipes: clone `https://github.com/meta-models/meta-model-cookbook` into `vendor/` and READ the relevant recipe before writing integration code (these APIs are new — do not guess request formats).

### 5.1 Connection
- **Base URL:** `https://api.meta.ai/v1`
- **Auth header:** `Authorization: Bearer $MODEL_API_KEY`
- **Env var:** `MODEL_API_KEY` (format looks like `LLM|{numeric_id}|{secret}`)
- **SDK:** the **OpenAI SDK works as-is** (`npm i openai`). It does **not** auto-read `MODEL_API_KEY` → pass it explicitly.
- Protocols available: **Responses API** (used in Meta's quickstart), **Chat Completions** (OpenAI-compatible), **Messages** (Anthropic-compatible). Use whichever the cookbook recipe for that feature uses; default to the Responses API.
- Errors: `401 invalid_api_key` = bad/missing key · `404 model_not_found` = wrong model id.

```ts
// minimal example (real code lives in src/lib/ai/clients.ts + router.ts, see 5.7/5.8)
import OpenAI from "openai";
export const meta = new OpenAI({
  baseURL: "https://api.meta.ai/v1",
  apiKey: process.env.MODEL_API_KEY!,   // server-side only, never expose to the browser
});

// first call
const r = await meta.responses.create({ model: "muse-spark-1.3", input: "Hello" });
console.log(r.output_text);
```

### 5.2 Models (exact IDs) and what Pathfinder uses them for
| Model | ID | Inputs → Output | Pathfinder job |
|---|---|---|---|
| Muse Spark 1.3 | `muse-spark-1.3` | text, image, video, audio, PDF → text · tool calling · structured output · reasoning effort · 1M ctx | **Workhorse:** read photos, structured claims, verification, summaries, news ingest, notice reading, ranking |
| Muse Spark 1.3 Contributor | `muse-spark-1.3-contributor` | same (no `max` reasoning) · ~12× cheaper · **content may train Meta models** | Bulk testing with our OWN sample photos only. Never for real users' uploads |
| Muse Spark 1.2 | `muse-spark-1.2` | same | Fallback if audio understanding needed inside Spark (1.3 audio is "not fully supported") |
| Muse Wonder | `muse-wonder-1.0` | text, image, video, audio, PDF → text · tool calling · structured output · reasoning `minimal`→`max` | **Agents:** Route Check, What-If, Road Watch re-planning, Crew Dispatch, debris → clearing-time reasoning, risk forecast |
| Muse Image | `muse-image-1.0` | text + image → image (precise text rendering) | Shareable **alert cards** (never to edit evidence photos) |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | audio → transcript (WebSocket streaming or single HTTP upload; NOT via OpenAI SDK) | Hindi/English **voice notes**. ⚠️ Hindi support not documented → test in Phase 0 |
| SAM 3.1 | `sam-3.1` | text prompt + image/video → **boxes + masks** (via `meta-sam` package, Python/TS) | Segment **debris, snow, water, road, vehicle, person, face, license plate**; measure blockage; track vehicles in video; find faces/plates to blur |
| Muse Spark Open | (not on Model API) — on Baseten: **`meta-models/muse-spark-open-1026`** | text, image, video, audio → text | Second opinion in **dual-model verification** (open-weight bonus prize). Optional, only if Baseten credits are approved |
| Muse Glimmer | (not on Model API) | 30B, text + tools, needs 24 GB+ GPU | Not used (can't run on a Mac) |

### 5.3 Capabilities & which cookbook recipe to read first
| Capability | Used for | Recipe |
|---|---|---|
| Vision input (URL or base64) | photos | `01_api_fundamentals/07` |
| Structured output (schema-guaranteed JSON) | claims, events, verdicts | `01_api_fundamentals/04`, `02_agent_patterns/05` |
| Tool calling (execute → feed back loop) | all agents | `01_api_fundamentals/03`, `02_agent_patterns/02` |
| Basic agent loop | Road Watch, Investigator | `02_agent_patterns/01`, `/03` |
| Search grounding (live web + citations) | news ingest, cold start | `01_api_fundamentals/10` |
| Reasoning effort control | cheap vs deep thinking | `01_api_fundamentals/06` |
| Prompt caching | long stable system prompts | `01_api_fundamentals/05` |
| Error handling (retry + backoff) | every call | `01_api_fundamentals/09` |
| Perception grounding (overlays on image) | annotated photos | `03_use_cases/10` |
| SAM basics (image + video) | measurement, tracking, blurring | `07_sam/01` |
| Speech to text | voice notes | `06_muse_voice/01` |
| Muse Image generate/edit | alert cards | `05_muse_image/01` |

### 5.4 Pricing & rate limits (keep total spend under the $150 credit)
| Model | Input /1M | Cached /1M | Output /1M |
|---|---|---|---|
| Muse Wonder | $4.00 | $0.20 | $20.00 |
| Muse Spark (standard) | $1.25 | $0.15 | $4.25 |
| Muse Spark (contributor) | $0.10 | $0.002 | $0.20 |

SAM 3.1: **$2.50 / 1,000 images**, $0.20 / 1,000 video frames (50-frame min) · Muse Image: **$0.01 / image** · Voice: **$0.18 / hour** · Search grounding: **$2.50 / 1,000 searches** (+ tokens).
Rate limits (per team): Wonder & Spark 3,000 RPM / 4M TPM · Spark contributor 150 RPM · SAM 3,000 RPM · Muse Image 150 RPM.

Approx cost per action: SAM on a photo ~$0.0025 · Spark photo → claim ~$0.005 · verifier ~$0.006 · 30 s voice ~$0.0015 · Route Check with Wonder ~$0.15.

**Cost rules:** resize photos to max 1280 px before any AI call · cache every AI result in the DB (never re-run on the same photo) · Spark for bulk, Wonder only for agents · low reasoning effort by default, high only for Route Check / Dispatch · prompt caching for long system prompts · log tokens + cost per call to the `ai_calls` table.

**Budget rules (the $150 must cover building + demo users):**
- **Route Check cache:** key = route segments + departure window (30 min). Reuse the verdict for 15–30 min unless an event on that route changed. Many users check the same popular routes.
- **Spark first, Wonder only if needed:** simple routes with 0–1 events → Spark (~$0.04). Wonder (~$0.14) only for multiple events, What-If, or Crew Dispatch.
- **Road Watch is event-driven, NOT a timer on the AI:** plain code checks every 30 min whether any event on a watched route changed. The AI re-plans only when something changed.
- Rough cost per action: photo report ≈ $0.017 · Route Check (Wonder) ≈ $0.14 · What-If ≈ $0.10 · Nearby summary ≈ $0.005 · share card ≈ $0.01 · viewing ≈ $0.
- Show running spend in a dev-only footer (sum of `ai_calls.cost`). Warn the user at $50 and $100.

### 5.5 Baseten (Muse Spark Open) — used from Phase 0
- Muse Spark Open model id for the hackathon: `meta-models/muse-spark-open-1026` (NOT `muse-spark-open`).
- ✅ **Approved (Oct 27): $100 Baseten credits, up to 2M tokens/min on Muse Spark Open.**
- OpenAI-compatible Chat Completions: base URL **`https://inference.baseten.co/v1`**, key in `.env.local` as `BASETEN_API_KEY`, model **`meta-models/muse-spark-open-1026`**. Use `chat.completions.create` (not Responses).
  ```ts
  export const baseten = new OpenAI({ baseURL: "https://inference.baseten.co/v1", apiKey: process.env.BASETEN_API_KEY! });
  ```
- Baseten only serves **Muse Spark Open** (text/image/video/audio → text). No SAM, voice, image generation or Wonder there; those stay on Meta's Model API.
- **Baseten first** for every job it can do (see the routing table in 5.7). It has its own $100 and is also a Meta model, so it counts for the "Use of Meta AI" rubric and the open-weights prize. Log Baseten calls in `ai_calls` with `provider='baseten'`.
- Dual-model verification is ON: Muse Spark Open (Baseten) writes the claim, Muse Spark 1.3 (Meta API) independently verifies → "2 AI models agree".

### 5.6 Billing reality
✅ **Status (Oct 26): "$150.00 free credits in use" is confirmed on the Meta account; email alert at $120.** Content sent while on free credits may be used by Meta for product improvement, so test with our own/public road photos, not private photos of people. Never click "Stop using free credits". If a call fails asking for a payment method, stop and tell the user (they may need to add a card; credits are still used first). Before batch jobs, check remaining credit under Billing. When credits run low or real calls aren't wanted, use `AI_MODE=mock` (realistic fixture JSON from `data/seed/mocks/`) and make no real calls. If calls fail with billing errors, stop and tell the user. Never run batch AI jobs without asking first.
- **No card is linked yet** (user's choice). Phase 0's `hello-meta` tells us if Meta requires one. If it does, the app must keep working on Baseten + fallbacks (5.7) until the user decides.

### 5.7 Provider routing & failure handling — THE APP MUST NEVER CRASH BECAUSE OF AN AI PROVIDER
All AI calls go through one module, `src/lib/ai/router.ts`, with a function per job (`writeClaim()`, `verifyClaim()`, `segment()`, `transcribe()`, `routeCheck()`, …). Pages and API routes never call a provider directly.

**Routing table (primary → fallback → last resort):**
| Job | Primary | Fallback | Last resort (no AI) |
|---|---|---|---|
| Photo → structured Claim | **Baseten** Spark Open | Meta `muse-spark-1.3` | Save report as "pending review", no claim |
| Verifier (second opinion) | Meta `muse-spark-1.3` | Baseten (2nd prompt, marked "1 model") | Rule-based checks only (same segment, time, count) |
| News parsing, Nearby summary, Hindi translation, advisory draft | **Baseten** | Meta `muse-spark-1.3` | Template text from code |
| Route Check / What-If / Crew Dispatch agents | Meta `muse-wonder-1.0` | Baseten Spark Open with the same tools (if tool calling works there; test in Phase 0) | Code-built verdict from events + OSRM (7.5b) |
| SAM segmentation / measurement / face-plate blur | Meta `sam-3.1` | — | Skip measurements ("measurement unavailable"); **block public photo** until blurred, or show it only as a thumbnail with heavy blur |
| Voice note → transcript | Meta `muse-voice-transcribe-1.0` | Baseten Spark Open (audio input) | Keep audio, show "transcript unavailable" |
| Alert card image | Meta `muse-image-1.0` | — | Card drawn by code (sharp SVG) |
| Search grounding (news) | Meta `muse-spark-1.3` + grounding | — | Skip the ingest run, log it |

**Failure rules:**
1. Every provider call: timeout (30 s text, 60 s agents), 2 retries with backoff for 429/5xx, then fallback.
2. `401` / `402` / `403` / any error mentioning *payment*, *billing*, *credit* or *quota* → mark that provider **down for 10 min** in memory (circuit breaker), log once, and go straight to the fallback. Don't retry billing errors.
3. Never throw to the page. API routes return `{ ok: true, data, degraded?: "reason" }`. The UI shows a small glass toast like "AI measurement unavailable right now" instead of an error screen.
4. `GET /api/health` → `{ meta: "ok|down|unknown", baseten: "...", mode: "live|mock" }`. Dev-only footer shows it with the spend counter.
5. `AI_MODE=mock` → all jobs return fixtures from `data/seed/mocks/` (no network). `AI_MODE=auto` (default) → routing table above.
6. Test the fallbacks: `scripts/test-fallbacks.ts` forces each provider down and checks the pages still load.

### 5.8 Starter code (verify the exact request shape against the cookbook recipe before relying on it)
```ts
// src/lib/ai/clients.ts  (server-only)
import OpenAI from "openai";
export const meta = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY ?? "missing" });
export const baseten = new OpenAI({ baseURL: "https://inference.baseten.co/v1", apiKey: process.env.BASETEN_API_KEY ?? "missing" });
export const SPARK_OPEN = "meta-models/muse-spark-open-1026";

// Baseten: Chat Completions, image as base64 data URL
const r = await baseten.chat.completions.create({
  model: SPARK_OPEN,
  messages: [{ role: "user", content: [
    { type: "text", text: "Describe the road condition. Reply as JSON matching the schema." },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
  ]}],
  response_format: { type: "json_object" },   // then validate with zod
});

// Meta: Responses API (vision + structured output) — check recipes 01/07 and 01/04
const m = await meta.responses.create({
  model: "muse-spark-1.3",
  input: [{ role: "user", content: [
    { type: "input_text", text: "Verify this claim against the photo: ..." },
    { type: "input_image", image_url: `data:image/jpeg;base64,${b64}` },
  ]}],
  text: { format: { type: "json_schema", name: "verdict", schema: VerdictJsonSchema, strict: true } },
});
// Tool calling → recipe 01/03 + 02/02 · SAM → 07_sam/01 (meta-sam package) · Voice → 06_muse_voice/01 · Image → 05_muse_image/01
```
SAM, Voice and Muse Image do **not** use the OpenAI SDK shapes above — copy the pattern from their cookbook recipes.

---

## 6. AI architecture & rules

### 6.1 Pipeline
```
INPUTS: photo · video · voice note · text · news (search grounding) · official notice (PDF/image) · official field update
   │
   ▼
INGEST  ─ voice → Voice Transcribe
        ─ image → privacy pass (strip EXIF, SAM face/plate → blur) → resize
        ─ SAM 3.1 masks (debris, snow, water, road, vehicle) → measurements
        ─ Spark → structured CLAIM (zod schema)
        ─ snap GPS → nearest road segment (Turf)
   │
   ▼
VERIFY  ─ Verifier: cross-check claim vs other claims on segment, time, season, altitude, weather,
          official updates, (optional) Spark Open second opinion → accept / pending / reject + confidence
        ─ Investigator agent (Phase 5): if confidence low or stale → gather more evidence
   │
   ▼
WORLD STATE ─ road EVENT per segment: type, status, measurements, ETA, confidence, freshness, timeline
   │
   ├─ Journey: Route Check agent (Wonder + tools) → verdict, disrupted patches, What-If
   ├─ Road Watch: watches saved trips → re-plan + alert
   ├─ Nearby: rank events in radius + summary
   └─ Command Centre: priority queue, Crew Dispatch, advisories
```

### 6.2 Non-negotiable AI rules
1. **Every AI output is structured JSON validated with zod.** Invalid → retry once → fall back gracefully.
2. **Every number is an estimate with a range + confidence** (e.g. `blockedLengthM: {min: 30, max: 40}`, UI shows "~35 m"). Never fake precision.
3. **Metres from pixels:** use reference objects in the frame (car ≈ 1.7 m wide, lane ≈ 3.5 m, NH two-lane ≈ 7 m, JCB ≈ 2.5 m wide). If no reference → say "unknown", don't invent.
4. **Never alter evidence photos.** Annotated versions are drawn by code (sharp SVG overlay) from SAM masks + Spark facts and stored *next to* the original. Muse Image is only for separate alert cards.
5. **Privacy:** strip EXIF before storing; blur faces + number plates before anything is public; store only coarse user location (~1 km) for Scout; no location history.
6. **Safety:** never send a Scout request to someone moving > 10 km/h; notifications say "only when safely stopped". Every status shows freshness + "verify with official sources".
7. **Official updates** carry more trust but still need a photo; SAM checks progress claims against it; conflicts with public reports are flagged, not silently overwritten.
8. Prompts live in `src/lib/ai/prompts/*.ts` as versioned constants. Agents' tool definitions live in `src/lib/ai/tools/*.ts`.
9. Log every AI call (model, tokens, cost, latency, purpose) to `ai_calls`.

### 6.3 Key schemas (zod; refine if needed)
```ts
Claim = {
  source: "photo"|"video"|"voice"|"text"|"news"|"notice"|"official",
  eventType: "landslide"|"snow"|"ice"|"flood_water"|"road_damage"|"pothole"|"traffic"|"accident"|"closure_notice"|"clear"|"other",
  status: "open"|"slow"|"one_lane"|"closed"|"unknown",
  passable: { bike: boolean|null, car: boolean|null, bus: boolean|null },
  measurements?: {
    blockedLengthM?: {min:number,max:number}, roadWidthLeftM?: {min:number,max:number},
    roadTotalWidthM?: number, blockedPct?: {min:number,max:number}, debrisVolumeM3?: {min:number,max:number},
    vehiclesVisible?: number, snowCoverPct?: number
  },
  crowd?: "low"|"medium"|"high",
  summary: string,              // 1 sentence, plain English
  summaryHi?: string,           // Hindi
  confidence: number,           // 0..1
  reasoning: string             // short, shown in "why" UI
}

RoadEvent = {
  id, segmentId, roadRef, km, placeName, lat, lng,
  type, status, passable, measurements, etaClear?: {earliest: ISO, latest: ISO},
  confidence, lastConfirmedAt, startedAt, sources: {reports:number, official:number, news:number, notices:number},
  modelsAgreed?: number, crew?: {org, crewName, onSiteSince, pctCleared, machines}, timeline: TimelineItem[]
}

RouteVerdict = {
  verdict: "go"|"go_with_care"|"delay"|"avoid",
  headline: string,            // "Leave by 4:00 AM"
  disruptions: {eventId, order:number, etaAtSegment: ISO, impact: string}[],
  options: {label, departAt, arriveAt, viaRoad?, pros:string[], cons:string[], recommended:boolean}[],
  reasoning: string, usedSources: string[]
}
```

### 6.4 Agents & their tools
| Agent | Model | Tools |
|---|---|---|
| Route Check / What-If | Wonder | `get_route(from,to)`, `get_segments_on_route(routeId)`, `get_events(segmentIds)`, `get_weather(lat,lng,time)`, `get_pass_timings(place)`, `find_alternate_routes(from,to,avoidSegmentIds)`, `estimate_eta(routeId,departAt)`, `find_stays(near)` |
| Road Watch | Wonder (low effort) | same as above + `notify_user(userId,message)` |
| Investigator | Spark | `get_claims(eventId)`, `search_news(query)` (grounding), `get_official_updates(eventId)`, `request_scout_photo(segmentId,question)` |
| Crew Dispatch | Wonder | `get_open_events(district)`, `get_crews(district)`, `compute_vehicle_hours(eventId)` (code), `draft_advisory(eventId)` |
| Risk Forecast | Wonder | `get_rain_forecast(segmentIds)`, `get_event_history(segmentIds,days)` |

---

## 7. FRONTEND — "Pathfinder Glass" design (USE THIS DESIGN ONLY)

**References (in priority order):**
1. **`docs/design/glass-html/*.dc.html`** — the Pathfinder Glass screens as HTML with exact inline styles (colours, radii, blur, spacing, copy). **Read the matching file before building each screen** and copy its structure/values into React + Tailwind. `Map.dc.html` = the stylised map look; `Main.dc.html` = Home. ⚠️ `ControlRoom.dc.html` is the OLD desktop layout — build screen 14 as the **phone layout** described in 7.5 instead.
2. **`docs/design/frames/*.png`** — PNG exports of all 19 Figma frames (if the user has added them). Use them to check the result visually against your Playwright screenshots.
3. Figma prototype "Pathfinder Glass — Prototype" → https://www.figma.com/design/TfO0HHtU864OIUC6fkAzCf (for the user; you may not be able to open it).
4. Sections 7.1–7.7 below. Ignore the older "Pathfinder 2.0 / Warm Himachali" designs.

**Fidelity check per screen:** screenshot at 390×844 → compare with the PNG/HTML → fix spacing, sizes, colours, blur → only then call the screen done. Real data replaces the sample text, but the layout stays the same.

### 7.1 Core idea
**iPhone-style frosted glass UI floating over a full-screen live map** (like Apple Maps). The map is ALWAYS the base layer. There is **no tab bar**: everything starts from the map + a **draggable bottom sheet**. Floating glass circle buttons sit on the map. **Every screen is phone-first (390 × 844), including the Command Centre** (officials and crews use phones on site). On wider screens, centre the sheet content at max-width ~480 px over the full-width map. On ≥1024 px the Command Centre may optionally spread into two side panels, but the phone layout is the reference.

### 7.2 Design tokens (put in `tailwind.config` + CSS variables)
```
Font:        -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif  (load Inter as fallback)
Text:        primary #1D1D1F · secondary #48484A · tertiary #6E6E73 · on-dark #FFFFFF / #D1D1D6
Accent:      #0071E3 (buttons, route line, active states) · link text #0066CC · accent-tint rgba(0,113,227,0.12) with text #0058B0
Map ground:  #E7EDE3 (land) · water #A9CBEA · roads white with #C7CFC2 casing · snow #F4F6F7
Status (ALWAYS word + colour, never colour alone):
  open      dot #1E7B45 · pill bg rgba(52,199,89,0.16) · text #1A6B35
  slow/one-lane  dot #C25E00 · pill bg rgba(255,159,10,0.20) · text #8A4300
  closed    dot #B3261E · pill bg rgba(255,59,48,0.14) · text #A1251C
  unknown   dot #8E8E93
  risk      #7B5CD6 · tint rgba(123,92,214,0.12) · text #4A2F9A
  my location #0A84FF with 7px halo rgba(10,132,255,0.18)
Radii:       sheet 30 (top corners) · cards 16 · stat tiles 14 · buttons 14 · pills 999 · circle buttons 50%
Spacing:     sheet padding 8/18/24/18 · gaps 10–14 · min touch target 44 px
```

### 7.3 Glass recipe (light) — `.glass`
```css
background: rgba(250,250,252,0.76);
backdrop-filter: blur(30px) saturate(180%);
-webkit-backdrop-filter: blur(30px) saturate(180%);
border: 0.5px solid rgba(255,255,255,0.85);
box-shadow: 0 -10px 34px rgba(0,0,0,0.14);
```
- Floating buttons: same but `blur(20px)`, opacity 0.72, shadow `0 4px 16px rgba(0,0,0,0.12)`.
- Cards inside a sheet: `rgba(255,255,255,0.84)`, radius 16, no border.
- **Dark glass** (camera, photo viewer): `rgba(30,30,30,0.5)` + `blur(28px)`, border `rgba(255,255,255,0.18)`, white text.
- Keep opacity ≥ 0.75 for text-heavy sheets so text stays readable in sunlight. Provide a `@supports not (backdrop-filter…)` fallback with solid `#FAFAFC`.

### 7.4 Components to build in `src/components/glass/`
`Sheet` (bottom sheet with grabber, 3 detents: peek / half / full, drag + snap; use `vaul` or framer-motion — ask before adding), `GlassButton` (circle), `GlassPill`, `Card`, `StatTile`, `StatusPill`, `ListRow` (dot · title · subtitle · chevron), `Segmented`, `Switch`, `ProgressBar`, `PassabilityChips` (Bikes/Cars/Buses ✓/✕), `Header` (title + subtitle + close), `PrimaryButton`, `SecondaryButton`, `Toast`. Icons: **lucide-react** (stroke icons, never emoji).

### 7.5 Screens (route → Figma frame)
| Route | Figma frame | Content |
|---|---|---|
| `/welcome` | 01 Welcome | blurred map + glass card: app icon, 3 value rows, **Be a Scout** switch, **Allow location**, Not now |
| `/` | 02 Home | map; glass profile (top-left) + alerts bell with badge + layers/locate stack (top-right); sheet: "Where to?" search (+ mic), 3 tiles Journey / Nearby / **Report (filled blue)**, "Near you right now" card, "Watching …" card |
| `/route?from&to&depart` | 03 Route result | route line on map; back + trip pill; sheet: verdict pill + headline + meta, disruptions list (dot, title, "one lane · clears ~1–2 PM · 9 photos"), "N repair crews working" link, purple **rain risk** banner, 2 What-If option chips, **Watch this trip** switch |
| `/route/options` | 04 What-If planner | 3 option cards (best one outlined + BEST pill), arrival time, bullets, reasoning box, "Use 4 AM plan" |
| `/event/[id]` | 05 Disruption detail | tall sheet: title + close, annotated photo with "One lane open" chip + "See 9 photos", 2×2 stat tiles (blocked stretch, road left, clears around, debris volume), passability chips, reopening-predictor line, crew progress card, "Verified · 86% · sources · 2 AI models agree", Share alert card |
| `/event/[id]/photos` | 06 / 06b Photos | dark full-screen viewer; top glass strip (place, time, source, verified, status); SAM labels; bottom glass panel: **AI-annotated / Original** segmented, thumbnails, privacy note; share button |
| `/route/repairs` | 07 Repairs on route | crew cards: org, "At work" pill, % cleared bar, now / fully open / machines, last update |
| `/nearby` | 08 Nearby | radius circle on map, floating glass radius picker (5/10/25/50 km), rain-risk layer chip, sheet: AI summary + ranked list |
| `/alerts` | 09 Alerts | Road Watch alert card (See new plan), Scout request card (Share photo / Not now), earlier list |
| `/report` | 10 Report | camera view, dark glass controls: Cancel, auto location, mode Video / Photo / Drive, mic (hold to record), shutter, library |
| `/report/done` | 10b Report sent | map with ring at your report; sheet: what AI found, matched reports, transcribed note, +points, Done |
| `/report/drive` | 10c Drive & Map | recording banner, live issue tags on map, km condition strip, stats, Stop & review |
| `/share/[eventId]` | 11 Share alert card | dimmed map, Muse Image alert card (EN + HI), share targets |
| `/me` | 12 Me & Scout | profile, points / verified / first reports, badges, district leaderboard, location + Scout settings, "Road crew or official? Sign in" |
| `/official/login` | 13 Official sign-in | invite-only sign-in (Department ID + password), no public sign-up, "demo account" note |
| `/official` | 14 Command Centre (phone) | map base with risk layer; floating glass header (logo, "Command Centre · PWD Mandi · official", **Sign out** → 13); row of 4 glass stat tiles (active · crews free · vehicles hit · watching); bottom sheet: **Priority queue** "Ranked by impact" (4 rows: number, status dot, title, "veh/day · time · crew", status pill, chevron → 15), **AI Dispatch Plan** card (3 crew steps + "Saves ~2,400 vehicle-hours" in green) with **Approve plan** (primary) + **Advisory** (secondary, → 14b) |
| `/official/advisory/[eventId]` | 14b Public advisory | map; sheet: "Public advisory" + "Draft · written from verified events" + close (→ 14); ENGLISH card; हिन्दी card; blue reach line "Reaches 612 travellers watching NH-3 near Mandi"; **Publish to travellers** (creates the alert, → 14) |
| `/official/field/[eventId]` | 15 Field update | sheet form: progress photo (required), status segmented, % cleared slider, fully-open time, machines, voice note, **AI check** result, Post update |

### 7.5b Works as a normal map too (not only when there's an incident)
Pathfinder must be useful on a day with **zero events**. A clear road is a result, not an empty screen.
- **Browse:** pan/zoom the real HP map, search any place (Photon), tap a place → name + "Directions".
- **Route with no events:** still show the route line, **distance, drive time (OSRM), arrival time**, and the main roads used ("via NH-3 · Pandoh · Aut"). Verdict pill = green **"All clear"**, plus "No verified issues on this route · last checked 10 min ago". Also show weather along the route (Open-Meteo) and the purple rain-risk banner if rain is forecast.
- **Up to 3 route alternatives** from OSRM (`alternatives=true`), each with its time + its own status.
- **Drive time is adjusted for events:** OSRM time + delay per event (one lane +20 min, slow +10 min, closed → reroute). Label it "Includes ~25 min delay at Aut".
- **Cost:** a route with no events needs **no AI call at all**. The verdict is built in plain code from the OSRM result + "0 events". Spark/Wonder runs only when events exist on the route.
- Not in scope (say so if asked): live traffic speeds, turn-by-turn voice navigation, public transport. "Open in Google Maps" button for live turn-by-turn.

### 7.6 THE MAP — real, detailed Himachal Pradesh with all roads
- Use **MapLibre GL JS** with **OpenFreeMap** vector tiles (real OSM data: every road, track, river, village, contour-like landuse). No API key needed.
- Restyle the base style to match Glass: land `#E7EDE3`, forest/greens slightly darker `#DCE4D7`/`#D5DFCF`, water `#A9CBEA`, roads white with light casing, highways a bit wider, labels `#3A3A3C`, hide POI clutter. Optional hillshade if a free DEM source works without a key (ask first).
- **Bounds:** Himachal Pradesh ≈ lng 75.5 → 79.0, lat 30.3 → 33.3. Default view: **Mandi** (≈ 31.708 N, 76.932 E), zoom ~9. Do **not** lock panning to HP: allow North India (≈ lng 72 → 82, lat 26 → 35) so routes from Delhi, Chandigarh, Punjab and J&K are visible. OpenFreeMap tiles cover the whole world, so nothing extra is needed for the base map.
- **HP boundary polygon:** Phase 0 also downloads the Himachal Pradesh boundary (OSM relation, `admin_level=4`) → `data/hp-boundary.geojson`. Draw it as a faint dashed outline, and use it to split routes (see 7.5c).

### 7.5c Trips that start or end outside Himachal (e.g. Delhi → Manali, Delhi → Shimla)
Routing (OSRM) and the base map are worldwide, so the whole trip always works. Only **condition checks** are Himachal-only, and the app says so honestly.
1. OSRM gives the full route (e.g. Delhi → Manali ≈ 530 km).
2. Split it with Turf at the HP boundary into **parts outside HP** and **parts inside HP**, and record the **entry point** (nearest named place where the route crosses, e.g. Swarghat/Kiratpur, Parwanoo, Nurpur, Paonta Sahib).
3. **Outside HP:** route line drawn grey-blue, OSRM time + distance only. Row in the sheet: "Delhi → Kiratpur (Punjab border) · 320 km · ~5 h 30 m · Outside Himachal: normal drive, live traffic not checked".
4. **Inside HP:** the full Pathfinder treatment: events, verdict, photos, crews, What-If, rain risk. Snap to `road_segments` only here.
5. The verdict pill is about the Himachal part ("Himachal stretch: one lane at Aut"). The headline still gives the **total arrival time** = outside time + inside time (with event delays).
6. What-If departure advice uses the HP entry time: "Leave Delhi at 11 PM → reach Kiratpur ~4:30 AM → Aut clears by 7 AM."
7. Route Check agent tools only get the HP segments, which saves tokens. Trips fully outside HP (e.g. Delhi → Jaipur): show a normal route + "Pathfinder checks roads in Himachal Pradesh only".
8. Road Watch alerts only fire for events inside HP.
- **Our own road layer on top** from `data/segments.geojson` (OSM highways in HP: `motorway, trunk, primary, secondary, tertiary` + key `unclassified`/`track` for trek access). This is what events snap to. NH-3 appears in OSM as `ref=NH3` (older name NH21) — handle both.
- Layers we draw: route line (`#0071E3`, 6 px, white 11 px casing), event pins (status colours, white ring, shadow), my location (blue dot + halo), Nearby radius circle (accent 8% fill, dashed 55% stroke), risk areas (purple 22% fill, dashed), report ring.
- Demo places (approx — **verify against OSM** and store in `data/places.json`): Mandi 31.708, 76.932 · Aut 31.75, 77.20 · Pandoh 31.67, 77.06 · Kullu 31.957, 77.109 · Manali 32.243, 77.189 · Solang 32.316, 77.157 · Atal Tunnel south portal ≈ 32.36, 77.17 · Sissu 32.48, 77.12 · Triund trailhead (McLeod Ganj) 32.24, 76.32 · Jalori Pass 31.53, 77.37 · Shimla 31.104, 77.173.
- Overpass query (Phase 0 script `scripts/fetch-roads.ts`): highways of the listed classes inside the HP bbox (or the HP admin boundary, `admin_level=4`, name "Himachal Pradesh"); save raw → `data/hp-roads.geojson`; then chop into ~1 km segments with Turf `lineChunk`, give each a stable id (`{ref|name}-{km}`), store in DB (`road_segments`, PostGIS LineString) + `data/segments.geojson`.
- **Two separate things, don't confuse them:**
  1. **Base map (what you see):** streamed live from OpenFreeMap tiles. Nothing to download. It already contains every road, village and river in HP.
  2. **Our road layer (what events attach to):** downloaded ONCE from OSM with the script below, checked into `data/`.
- Overpass endpoint: `https://overpass-api.de/api/interpreter` (POST, `data=` body). Query:
  ```
  [out:json][timeout:180];
  area["name"="Himachal Pradesh"]["admin_level"="4"]->.hp;
  ( way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](area.hp);
    way["highway"~"^(unclassified|track)$"]["name"](area.hp); );
  out geom tags;
  ```
  Convert with `osmtogeojson` (ask before adding). Keep tags `highway, ref, name, surface, oneway`. If the area query fails, fall back to bbox `(30.3,75.5,33.3,79.0)`.
- Size: simplify geometry (`turf.simplify`, tolerance ~0.0001) so `segments.geojson` stays < 15 MB. For the map, serve it from Supabase via `/api/segments?bbox=` (only what's on screen) rather than loading the whole file in the browser.
- The script prints: number of ways, total km, and km per class (NH/SH/district). **Sanity check:** NH-3 Mandi → Manali should be ~110 km of segments. Show the user these numbers and a screenshot of the layer over the map before moving on.
- Re-run only if needed (OSM data changes slowly). Credit OSM on the map: "© OpenStreetMap contributors · OpenFreeMap".

### 7.7 UX rules
- Map always visible; sheets never cover the whole map except detail/alerts (top ≥ 96 px).
- One primary action per screen. Big numbers on top, evidence below.
- Every status = word + colour + freshness ("12 min ago"). Every estimate = "~" + confidence.
- Hindi where it helps (voice notes, advisories, summaries). `lang="hi"` on Hindi text.
- Accessible: real `<button>`/`<a>`, aria-labels on icon buttons, 4.5:1 text contrast on glass, 44 px targets, respects reduced motion.
- Smooth transitions: sheet snaps with spring; screens cross-fade (like Figma's Smart Animate).

---

## 8. Data model (Supabase / Postgres + PostGIS)

```
users            id, display_name, role ('public'|'official'|'crew'|'admin'), org, district,
                 scout_opt_in bool, location_mode ('off'|'while_using'|'always'),
                 coarse_lat, coarse_lng, coarse_updated_at, speed_kmh, points int
road_segments    id text pk, road_ref, road_name, km_start, km_end, length_m, geom LineString(4326), district
places           id, name, kind ('town'|'pass'|'trek'|'tunnel'), lat, lng
reports          id, user_id, segment_id, lat, lng, created_at, media_type, text, voice_url,
                 transcript, transcript_lang, status ('pending'|'accepted'|'rejected'), points_awarded
photos           id, report_id, event_id, original_url, annotated_url, width, height,
                 sam_masks jsonb, measurements jsonb, faces_blurred bool, source ('traveller'|'scout'|'official')
claims           id, report_id, source, payload jsonb (Claim), confidence, created_at
events           id, segment_id, type, status, passable jsonb, measurements jsonb, eta_clear jsonb,
                 confidence, started_at, last_confirmed_at, resolved_at, sources jsonb, models_agreed int
event_timeline   id, event_id, at, kind ('report'|'official'|'news'|'notice'|'ai'), text, actor, data jsonb
official_updates id, event_id, user_id, status, pct_cleared, eta_full_open, machines, photo_id,
                 ai_check jsonb, created_at
crews            id, org, district, name, machines, available bool, current_event_id
watched_trips    id, user_id, from_place, to_place, depart_at, route_cache jsonb, last_verdict jsonb, active bool
alerts           id, user_id, kind ('road_watch'|'scout_request'|'info'), title, body, data jsonb, read bool, created_at
scout_requests   id, segment_id, question, demand_count, sent_to user_ids[], fulfilled_by_report_id, created_at
news_items       id, url, title, published_at, segment_id, claim_id
ai_calls         id, at, purpose, provider ('meta'|'baseten'|'mock'), model, input_tokens, output_tokens, cost_usd, latency_ms, ok, fallback_used bool, error_kind
```
Row-level security: public users read events/photos (annotated only) and write their own reports; only `official`/`crew` roles write `official_updates`; only `admin` creates official accounts.

---

## 9. API routes (Next.js `/api/*`, server-side only for AI)
`POST /api/reports` (multipart: photo/video, lat, lng, voice?) → pipeline → claim + event · `GET /api/events?bbox=` · `GET /api/events/[id]` · `GET /api/events/[id]/photos` · `POST /api/route-check` {from,to,departAt} → RouteVerdict · `POST /api/route-check/options` · `GET /api/nearby?lat&lng&radiusKm` · `POST /api/watch` / `DELETE /api/watch/[id]` · `GET /api/alerts` · `POST /api/scout/respond` · `GET /api/me` · `POST /api/official/updates` · `GET /api/official/queue?district=` · `POST /api/official/dispatch` · `POST /api/official/advisory` · `POST /api/share/[eventId]` (Muse Image card) · cron: `/api/cron/road-watch`, `/api/cron/ingest-news`, `/api/cron/reverify`, `/api/cron/scout-gaps`.

---

## 10. Environment variables (`.env.example` — names only)
Cloud session: the user sets these in the cloud environment **Environment variables** (Claude app → environment `meta_hackathon` → Edit). Local Mac: `.env.local`. Vercel (Phase 6): Project → Settings → Environment Variables. Supabase vars get added in Phase 0 Part C when the user creates the project.
```
MODEL_API_KEY=            # Meta Model API
BASETEN_API_KEY=          # Baseten (Muse Spark Open)
AI_MODE=auto              # auto (routing table 5.7) | mock (fixtures, no network)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # server only
OSRM_URL=https://router.project-osrm.org
MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
CRON_SECRET=
```

---

## 11. Coding rules
- TypeScript strict. Small files. Server code never imports into client components (keys!).
- All AI calls go through `src/lib/ai/router.ts` (section 5.7): validate with zod, retry with backoff, fall back between providers, log to `ai_calls`, respect `AI_MODE`. A provider error must never crash a page.
- No secrets in client bundles, logs, commits, screenshots.
- Commit after every working step (`feat(phase-1): report upload pipeline`).
- Write a short test or a script for each AI step (`scripts/test-sam.ts` etc.) so it can be checked on a real photo.
- Mobile-first; test at 390 px width and on a real phone.
- Prefer simple, working code over clever abstractions. This is a 9-day hackathon.

---

## 12. Demo data
- `data/seed/photos/`: real Himachal road photos collected by Dhruv (ask before using any photo; strip EXIF).
- `scripts/seed.ts`: creates ~10 events along the corridor (Aut slide one-lane, Atal Tunnel snow, Kataula closure, Pandoh slow, Triund open, etc.), a demo official account "PWD Mandi (demo)", 3 crews, sample timeline + official updates, 2 watched trips, sample alerts.
- Seeded data must be clearly marked `is_demo=true` so it can be wiped.

---

## 13. PHASES (build strictly in order — see section 0)
_Schedule shifted by one day on Oct 28 (Phase 0 started late). Deploy to Vercel early (end of Phase 2) so there's always a live link._

### Phase 0 — Setup & proof (Wed Oct 28)
**Part A — skeleton + AI connections**
1. Scaffold Next.js 15 + TS + Tailwind; folder layout from section 4; `.env.example`; `.gitignore` (incl. `.env*.local`, `vendor/`). Add `docs/meta-api-reference.md` and `docs/design/` if the user provided them.
2. Clone the Meta cookbook into `vendor/` (read-only, git-ignored).
3. `src/lib/ai/clients.ts` + skeleton `src/lib/ai/router.ts` with the circuit breaker, `AI_MODE`, and `/api/health` (section 5.7).
4. `scripts/hello-baseten.ts` and `scripts/hello-meta.ts`: one tiny text call each → print `ok` + model reply (never the key). **If Meta fails with a payment/billing error: report it, mark Meta "down", and continue — do NOT stop the phase.**
5. `scripts/test-tools-baseten.ts`: does Spark Open on Baseten support tool calling? (decides the agent fallback in 5.7).
→ Stop. Report results. Ask "Continue to Part B?"

**Part B — perception tests (user attaches 1–2 road photos + a 10-s Hindi clip)**
6. `scripts/test-vision.ts`: photo → Baseten Spark Open → short description (and Meta Spark if Meta works).
7. `scripts/test-sam.ts`: SAM 3.1 with prompts `debris`, `road`, `vehicle`, `face`, `license plate` → print boxes/mask areas (follow `07_sam/01`).
8. `scripts/test-voice.ts`: Hindi clip → Voice Transcribe; also try Baseten Spark Open with audio → report which works for Hindi.
→ Stop. Report. Ask "Continue to Part C?"

**Part C — the Himachal map**
9. `scripts/fetch-roads.ts`: Overpass download → `data/hp-roads.geojson` → segments → `data/segments.geojson` (+ counts, km per class, NH-3 sanity check). Also `data/hp-boundary.geojson`.
10. Base app shell: full-screen **MapLibre map** (OpenFreeMap, Glass-styled per `Map.dc.html`), HP boundary outline, our segments layer for the corridor, my-location dot, one glass **Sheet** (draggable) + glass circle buttons — matching frame 02. Playwright screenshot at 390×844.
11. Supabase: the user creates the project and adds the 3 Supabase env vars; first migration with `road_segments` + `places` (PostGIS). If the user hasn't created it yet, skip and note it in the tracker.
**Done when:** both providers tested (or Meta marked down with the app still working), Hindi result known, the map shows real HP roads in Glass style, the sheet drags.

### Phase 1 — Core engine: Report → verified event (Thu Oct 29)
**Part A:** tasks 1–3 · **Part B:** tasks 4–6 · **Part C:** tasks 7–8
1. Full DB schema (section 8) + RLS basics.
2. `POST /api/reports`: upload → strip EXIF → resize → SAM faces/plates → blur → store original + public copies.
3. SAM measurement → `measurements` (with ranges, reference-object logic).
4. Claim via `router.writeClaim()` (Baseten Spark Open → fallback Meta Spark), zod-validated, voice transcript included, Hindi summary.
5. Snap to nearest segment; Verifier v1 via `router.verifyClaim()` (Meta Spark as second model) (merge into existing event on same segment within time window, else create; confidence update; timeline item).
6. Annotated image generator (sharp SVG overlay: masks, labels "Debris · ~35 m", "Road left ~2.8 m", top + bottom info strips).
7. UI: `/report` (frame 10) and `/report/done` (frame 10b) wired to the API. Event pins appear on the map.
8. `scripts/seed.ts` with demo events.
**Done when:** a real photo + Hindi note → event on the map with annotated photo, in < ~20 s.

### Phase 2 — Journey (Fri Oct 30)
**Part A:** tasks 1–2 · **Part B:** task 3 · **Part C:** task 4
1. Home sheet (frame 02) with search (place autocomplete from `places` + OSM names).
2. Routing via OSRM (with alternatives) → route geometry → segments on route → events on route. Place search via Photon. **Zero-event routes must show distance, time, arrival and an "All clear" verdict with no AI call** (see 7.5b). Trips from outside HP (Delhi → Manali) are split at the HP border (see 7.5c).
3. **Route Check agent** (Wonder + tools, section 6.4) → `RouteVerdict`.
4. `/route` (frame 03), `/event/[id]` (frame 05), `/event/[id]/photos` (frames 06/06b), `/route/options` What-If (frame 04).
**Done when:** Delhi/Mandi → Sissu shows verdict, every disrupted patch, details and photos — the demo-able "thin slice" 🎯.

### Phase 3 — Nearby, live data, alerts (Sat Oct 31)
**Part A:** tasks 1–2 · **Part B:** tasks 3–4 · **Part C:** task 5
1. `/nearby` (frame 08) radius search + ranking + AI summary.
2. News ingest via search grounding (cron) → claims → events (cold start fix).
3. Watched trips + **Road Watch** cron (re-check, re-plan, create alert).
4. `/alerts` (frame 09).
5. Risk Forecast v1 (Open-Meteo rain + event history) → purple risk banner on route + risk layer on Nearby.
**Done when:** map has live data without user reports; changing an event triggers a Road Watch alert.

### 😌 OFF DAY — Sun Nov 1. No building (optional: catch up on a leftover Part only).

### Phase 4 — Command Centre (Mon Nov 2)
**Part A:** tasks 1–2 · **Part B:** tasks 3–4 · **Part C:** tasks 5–6
1. Supabase Auth for officials (invite-only; admin script creates "PWD Mandi (demo)").
2. `/official/login` (13), `/official` Command Centre (14, phone layout): stat tiles + priority queue ranked by impact.
3. **Crew Dispatch** agent (vehicle-hours computed in code, plan explained by Wonder) + Approve.
4. `/official/advisory/[eventId]` (14b): public advisory draft EN/HI + Publish (creates alert + share card trigger).
5. `/official/field/[eventId]` Field Update (15) with SAM progress check; updates propagate to event timeline + Road Watch.
6. `/route/repairs` (frame 07) for travellers.
**Done when:** official posts "70% cleared, one lane" → traveller's route + repairs page update + alert fires.

### Phase 5 — Smart features (Tue Nov 3, morning — must items only)
**Part A:** tasks 1–2 · **Part B:** tasks 3–4 · **Part C:** tasks 5–6
1. **Investigator agent** (low confidence / stale → gather evidence → explain).
2. Debris volume → clearing-time estimate; **Reopening predictor** from photo sequence.
3. **Scout requests** (demand × data gap → nearby opted-in, stationary users → alert) + `/me` (frame 12) with points, badges, leaderboard, settings.
4. Share alert card with **Muse Image** (`/share/[eventId]`, frame 11).
5. Dual-model verification UI ("2 AI models agree") + agreement stats (Baseten claim vs Meta verifier, already wired in Phase 1).
6. Stretch: Time-consistency check, Official notice (PDF) reader.
**Done when:** Must items work; stretch only if time remains.

### Phase 6 — Navigation handoff, Drive Watch, production hardening, deploy (Tue Nov 3)
**Part A:** Start in Google Maps + Drive Watch · **Part B:** Slope Sentinel (landslide warning signs before failure) · **Part C:** "Can my vehicle cross?" check · **Part D:** production hardening · **Part E:** real data, polish, deploy, ship-ready repo. Same gating as every phase: STOP after each Part and wait for "continue". Schedule is tight: B and C are ~1 day and ~½ day; if behind, ask the user what to trim (Parts D–E are never cut).

Pitch line (use in UI copy + README): **"Pathfinder decides the safe route, Google Maps drives it."**
Pathfinder does NOT do turn-by-turn navigation. Don't build rerouting, lane guidance or turn prompts.

#### Design consistency (applies to ALL of Phase 6)
- Everything new must match the existing "Pathfinder Glass" design already used in the app: frosted-glass surfaces, map-first layout with draggable bottom sheets, phone-first sizing, same typography, colours, corner radii, shadows, spacing and icon style.
- Reuse the existing design tokens and shared components (buttons, sheets, banners, pills, alert cards). Don't hardcode new colours or fonts, and don't introduce a new UI library.
- Check the exported design files referenced in this file before building. Drive Watch is based on frame 10c, so follow that frame's layout, scoped down to the Phase 6A features.
- The Start / Open in Apple Maps / Drive Watch buttons on /route must look like they were always part of frame 03, using the same button hierarchy (primary vs secondary).
- Hazard-ahead and Road Watch banners in Drive Watch use the existing alert styles (same severity colours as the rest of the app). Make them large and readable at a glance while driving: bigger text and tap targets, high contrast over the map.
- Loading, error and empty states (Part E) and the demo login button (Part D) use the same Glass styling, not default browser or library styles.
- New screens in Parts B and C (`/slope/[id]`, the Slope report mode, `/event/[id]/fit`) reuse the event-detail (frame 05) and report (frame 10/10b) layouts: same sheet, stat tiles, cards, status/risk pills and photo viewer. Slope risk uses the existing purple **risk** tokens, never a new colour.
- Light and dark mode must both work if the app already supports both.
- After building each new screen, compare it side by side with an existing screen and fix any visual mismatch before saying the part is done.

#### Part A — Start in Google Maps + Drive Watch
1. **"Start" button** on the route result screen (/route, frame 03), primary action.
   - Opens a Google Maps directions deep link:
     `https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|LAT,LNG&travelmode=driving`
   - Waypoints are sampled from Pathfinder's CHOSEN route geometry so Google follows the same safe route (for example, when Pathfinder avoids a blocked patch, the waypoints must force the detour). Choose waypoints at the key decision points where the safe route leaves the default one, not evenly spaced.
   - Check Google's Maps URLs docs for the waypoint limit (mobile browsers allow fewer waypoints than desktop). Use the smallest set that still forces the route, and URL-encode it.
   - Pure code: no AI call, no Google API key needed.
   - Secondary option in a small menu: "Open in Apple Maps" (`maps.apple.com/?saddr=...&daddr=...&dirflg=d`). Apple's URL doesn't reliably support waypoints, so show a small note: "Apple Maps may choose a different road. Check Pathfinder alerts."
   - Show the button for every route, including all-clear routes and Delhi → Himachal routes (Google handles the non-HP part).
   - Next to Start, add a secondary button: "Drive Watch" (see 2).
2. **Drive Watch mode** (`/drive`, scoped-down version of frame 10c, Glass style, phone-first). Runs ALONGSIDE Google Maps (split screen or switching apps), or on its own.
   - Live GPS dot following the chosen route (`navigator.geolocation.watchPosition`, high accuracy), map auto-follows, shows distance remaining on the route.
   - Screen Wake Lock API (`navigator.wakeLock.request('screen')`) so the phone doesn't sleep. Re-acquire it on `visibilitychange`. If unsupported, fall back to a hidden looping muted video (NoSleep-style) and show a small "Keep screen on" hint. Note for UI copy: on iPhone the PWA can't track GPS when the screen is locked, so keep the screen on.
   - Hazard-ahead alerts: compute distance ALONG the route (not straight-line) to every event on the route ahead of the user. When one is within 5 km (and again at 1 km), show a banner and speak it with the Web Speech API (`speechSynthesis`), for example:
     - EN: "Debris, one lane open, 4 kilometres ahead near Aut tunnel."
     - HI: same message in Hindi (hi-IN voice).
     Language follows the app language setting. If no hi-IN voice exists on the device, fall back to English and show the Hindi text on screen. iOS needs a user gesture before speech works, so the "Start Drive Watch" tap must unlock speechSynthesis (speak a short "Drive Watch on" line). Don't repeat the same alert: track announced event IDs per threshold.
   - Road Watch alerts arrive live during the drive (Supabase realtime or polling every 30–60 s). A new or changed event on the route triggers a banner + voice.
   - Big "End drive" button. Release the wake lock and stop the GPS watch on exit.
   - Demo mode: `?simulate=1` replays a fake GPS track along the route at high speed so the hazard alerts can be shown in the demo video without actually driving. Clearly mark it as simulated in the UI.
   - No turn-by-turn instructions.

**Done when (A):** Delhi → Manali shows Start → Google Maps opens following Pathfinder's safe route; Drive Watch in simulate mode speaks "debris X km ahead" in EN and HI and shows a live Road Watch alert; all new UI matches the Glass design. → STOP. Wait for "continue".

#### Part B — Slope Sentinel (warning signs BEFORE a landslide)
Everything so far starts after the slide (debris already on the road). Slopes usually show warning signs hours or days before they fail. Slope Sentinel collects photos of the hillside ABOVE the road, has Meta's models read them like a field geologist, tracks how the signs change, combines them with the rain forecast and slide history, and raises a **pre-failure risk** per stretch. Pitch: "Pathfinder warns you before the hill comes down, not after."

**Honesty rules (non-negotiable):** it reports "warning signs a geologist would look for", never "this slope will fail at 3 PM". Every output shows a level (watch / elevated / high), reasons, confidence, freshness and "verify with officials / PWD". It NEVER changes an event's status and never closes a road. It only adds risk.

1. **SAM probe first (gate for the rest of the Part).** `scripts/test-slope-sam.ts`: run SAM 3.1 on 2–3 real slope photos (the user attaches them; strip EXIF, save in `data/seed/photos/slopes/`) with candidate concepts: `crack`, `fissure`, `water`, `wet soil`, `rock`, `boulder`, `fallen tree`, `leaning tree`, `bare soil`, `retaining wall`, `landslide`. Print boxes/areas per concept, then keep only the concepts that actually detect something (like `debris` → `rock` in Phase 0). Report the result to the user before building further. If SAM finds nothing useful for cracks/seepage, Muse Spark's reading becomes the main signal and SAM only gives rock/tree/wall/bare-soil areas.
2. **Report mode "Slope".** On `/report` (frame 10) add a "Slope" mode chip next to Photo, with a hint: "Point the camera at the hillside above the road. Only when safely stopped." Form field `kind=slope`. Location, voice note and the privacy pass (EXIF strip, SAM face/plate blur) are reused from Phase 1. Scout requests (Phase 5B) can now ask for slope photos: "Heavy rain is forecast here tonight. Can you photograph the hillside above km 42?"
3. **Reading the slope (2 models).** Router job `readSlope()`: Baseten Spark Open → Meta `muse-spark-1.3` → null (= "pending review"), effort low, prompt `prompts/slope.ts` (slope-v1), zod `SlopeReading`:
   `{ signs: [{ kind: "tension_crack"|"wall_crack"|"wall_bulge"|"seepage"|"fresh_rockfall"|"leaning_trees"|"fresh_scar"|"undercut_toe"|"loose_overhang"|"other", severity: "minor"|"moderate"|"major", looksFresh: boolean|null, aboveRoad: boolean|null, note: string }], overall: "none"|"minor"|"concerning"|"severe", confidence: 0..1, summary, summaryHi, reasoning }`.
   The prompt gets the SAM boxes/areas so the model can say "the crack SAM marked at upper left". Then a second check via `verifyClaim`-style job `checkSlope()` (Meta Spark → Baseten → rule-based): agrees / downgrades / rejects (e.g. "this is a dry rock face, no fresh signs"). Store the record like `VerificationRecord` so "2 AI models agree" shows here too. Not a slope photo (road, selfie, sky) → rejected, +0 points.
4. **Storage (schema change → ask the user, then they run it in the SQL Editor).** Migration `0003_slope_watch.sql`: `slope_sites` (id, segment_id, lat, lng, place_name, risk_level 'none'|'watch'|'elevated'|'high', risk jsonb (latest assessment), last_observed_at, last_assessed_at, is_demo) and `slope_observations` (id, site_id, report_id, photo_id, reading jsonb, check jsonb, sign_metrics jsonb, created_at, is_demo), RLS public read. A new observation within ~300 m of a site on the same segment joins that site, otherwise it creates a new site. Annotated copy (sharp SVG, Phase 1 style): labels like "Crack · fresh", "Water seeping", "Loose rocks" on the blurred public copy.
5. **Change over time (code, no AI).** For a site with ≥2 observations in 7 days: per sign kind, compare SAM area normalised to a stable reference in the frame (road width or retaining-wall height in pixels; else the whole image, marked "rough"), plus newly appearing sign kinds. Output e.g. "crack area ~3× larger than 18 h ago", "seepage new since yesterday". Always labelled "approximate: photos differ in angle".
6. **Slope risk agent.** Router job `assessSlopeRisk()`: Meta `muse-wonder-1.0` (effort low) → Baseten Spark Open → code rule. Tools in `ai/tools/slope.ts` (all code): `get_slope_site`, `get_observations` (readings + change metrics), `get_rain_forecast` (reuse `lib/risk/forecast.ts`, next 24 h), `get_event_history` (slides on this segment / within 3 km, last 90 days), `get_segment_info` (road class, traffic per day from `lib/official/impact.ts`), `submit_risk` → zod `SlopeRisk` `{ level, confidence, reasons[], advice, adviceHi, recheckInHours }`. Prompt `prompts/slopeRisk.ts`. **Code caps:** the level rises at most one step per run without a new photo; "high" needs ≥1 concerning/severe two-model-checked reading less than 48 h old; with no new photo for 72 h the site decays to "watch". Code fallback = matrix of slope reading × rain level × history. Triggers: a new observation (right away, via `after()`), or the daily cron when the forecast for a site turns moderate+ (`/api/cron/slope-watch`, fits the Hobby daily limit). No AI when nothing changed (5.4 budget rule).
7. **Where the risk shows up (reuse existing plumbing):**
   - Map: a slope site marker (risk purple, "mountain" lucide icon) + dashed purple stretch ±1 km, on Home, `/route` and `/nearby`.
   - `/slope/[id]` (frame-05 layout): level pill + headline, annotated slope photos (photo viewer reused), stat tiles (signs found · change since last photo · rain next 24 h · slides here in 90 days), reasons + advice EN/HI, a "Checked by 2 models" card, timeline, "Add a newer photo" → `/report?mode=slope&site=…`, "verify with officials".
   - Route: the planner lists slope sites on the route. Elevated/high → a purple banner "Unstable slope reported above Aut + 30 mm rain tonight. Cross before 6 PM; don't stop under it". The Route Check agent gets a `get_slope_risks` tool. The verdict stays event-based (risk is advice, not a closure).
   - Road Watch: a site on a watched route rising to elevated/high → alert.
   - Command Centre: a "Slopes to inspect" section under the priority queue (ranked by level × traffic), with "Send crew to inspect" (timeline item only).
   - Drive Watch (Part A): within 2 km of an elevated/high site, a banner + voice: "Unstable slope ahead. Don't stop for the next 2 kilometres." / Hindi.
   - Scout requests: rain forecast + a site with no photo in 24 h → ask nearby stationary scouts for a new slope photo (the existing rules: ≤10 km/h, max 2 a day).
8. **Points:** +20 for an accepted slope photo that adds a new sign or a newer view of a site. **Cost:** ~$0.03 per slope photo (SAM + 2 Spark calls) + ~$0.05–0.10 per Wonder risk run, only when something changed. **Tests:** `pnpm test:slope` (code caps, decay, change metrics, matrix fallback; no AI) + one live run on the seed slope photos. Seed: 2 demo slope sites on NH-3 (Aut, Jhiri) with is_demo.

**Done when (B):** a real slope photo → two-model reading with labelled signs → slope site on the map → with rain in the forecast (or `?replay=1`), the risk agent raises it to elevated with reasons → a banner on a route through it, a Road Watch alert on a watched trip and a "Slopes to inspect" row in the Command Centre; Drive Watch simulate speaks the slope warning; screens match Glass. → STOP. Wait for "continue".

#### Part C — "Can my vehicle cross?" (vehicle-fit check on a damaged road)
Example: a traveller planning Delhi → Manali opens the Kataula landslide, sees "Road left ~2–3 m" and isn't sure their car fits. On the event page they tap **"Check if my vehicle can cross"**, upload a photo of their vehicle, and Meta's models compare it with the road photos other users posted and give a detailed report.

**Key principle:** a photo of a car alone can't give its width in metres (no scale). So the AI **identifies the vehicle and what's on it**, real dimensions come from a **spec table**, the road gap comes from the event's **SAM measurements**, and **code** does the maths. The AI explains and adds what numbers can't (rubble height vs ground clearance, mud, the valley-side drop, roof load). Never claim certainty: the gap is a range and road photos age.

1. **Entry points.**
   - `/event/[id]` (frame 05): a secondary button "Check if my vehicle can cross" under the passability chips, shown for open events with status one_lane / slow / closed (closed = "for when it reopens to one lane").
   - `/route` disruption rows: once the user has a saved vehicle, each row shows a small fit pill: "Your Innova: fits" / "tight" / "won't fit" / "?".
2. **Vehicle data (code).** `data/vehicles.json`: ~25 common hill vehicles (bikes/scooters, Alto, Swift, WagonR, Dzire, Innova Crysta, Ertiga, Fortuner, Scorpio-N, Thar, XUV700, Bolero, Creta, Force Traveller 12/17-seater, mini-bus, HRTC/Volvo bus, pickup, 2-axle truck), each with width (body), width incl. mirrors, length, ground clearance, 4x4 yes/no, and the **manufacturer spec URL** used (verify each number; no guessed values). Plus generic categories (small car / sedan / SUV / van / bus / truck / bike) with ranges for unknown models.
3. **`/event/[id]/fit` screen** (sheet over the map centred on the event, Glass, phone-first):
   - Step 1 "Your vehicle": take or upload a photo (`lib/images/shrink.ts`), OR pick from a list (no photo needed), OR "use my saved vehicle".
   - Step 2 "Checking…" step list (like `/report`): "Identifying your vehicle · Reading the latest road photos · Measuring the gap · Second model checking".
   - Step 3 the report (below). "Save my vehicle" keeps the profile in **localStorage** (device-only, no schema change). The vehicle photo is NOT stored. It's used for this check only, after the plate blur.
4. **API** `POST /api/events/[id]/fit` (multipart `vehicle` photo, or JSON `{ vehicleId }` / `{ category }`), zod input:
   1. Privacy: SAM `license plate` + `face` → blur before any AI call (reuse `processPhoto` privacy pass, no measurement).
   2. Router job `identifyVehicle()` (Baseten Spark Open → Meta Spark → ask the user to pick), prompt `prompts/vehicle.ts` (vehicle-v1), zod `{ make, model, category, matchedVehicleId|null, confidence, roofLoad: boolean, roofLoadHeightM?: {min,max}, extras: string[] (carrier, bike rack, wide mirrors, trailer, lowered), loadedHeavily: boolean|null }`. Low confidence (<0.6) → show "Is this a Toyota Innova Crysta?" confirm/choose before continuing.
   3. Road side (code): the event's `measurements` (roadWidthLeftM range, roadTotalWidthM, blockedPct), status, passability, the newest 1–2 public photos (annotated + blurred) with their age, the latest official field update.
   4. **Fit maths (code, `lib/fit/fit.ts`):** needed = width incl. mirrors + 2 × 0.3 m safety (+0.3 m when the AI or SAM says the open side is the valley edge / collapsed edge). gapMin > needed → **fits**; gapMax < width incl. mirrors + 0.2 m → **won't fit**; otherwise → **tight** (fold mirrors, use a spotter, go slowly). No `roadWidthLeftM` → **unknown** ("road photos don't show the gap clearly") + offer a scout request. Length check only for buses/trucks at hairpins (rule text, no number invented). Photo older than 6 h → the verdict is capped at "tight", with "conditions may have changed".
   5. **Side-by-side reading (multi-image, 2 models).** Router job `assessFit()`: ONE call with the road photo(s) + the vehicle photo + the code numbers. Baseten Spark Open writes, then Meta `muse-spark-1.3` checks it independently (agree / adjust / disagree) → "2 AI models agree". Prompt `prompts/fit.ts` (fit-v1). zod `FitAssessment` `{ factors: [{ kind: "width"|"ground_clearance"|"surface"|"edge_drop"|"overhead"|"length_turning"|"water"|"other", verdict: "ok"|"caution"|"problem"|"unknown", detail }], overallAdvice, overallAdviceHi, confidence, reasoning }`. The model can lower the code verdict (e.g. "loose rocks look knee-high; your Swift's 163 mm clearance is low") but **can never raise** it above the code verdict.
   6. Cache per (event version, vehicle id, roof load) for 30 min; a re-check without a new road photo is free.
5. **The report** (cards, frame-05 style):
   - Big verdict pill: **Fits** (open green) / **Tight** (slow orange) / **Won't fit** (closed red) / **Unknown** (grey), with the headline "Your Innova Crysta (~2.0 m with mirrors) vs gap ~2.4–2.9 m".
   - A simple width diagram (code-drawn SVG): the gap range bar vs the vehicle width bar + safety margins.
   - Factor list (width, clearance, surface, valley-side edge, roof load, length) with ok/caution/problem.
   - Advice EN + HI: fold mirrors, unload the roof carrier, cross one at a time, wait for the predicted one-lane time (reuse the Phase 5 reopening predictor), or the alternate route (link back to `/route` options).
   - Evidence: the road photo(s) used + age + "N reports", "Checked by Muse Spark Open + Muse Spark 1.3".
   - Footer: "An estimate from photos. Follow police / PWD instructions on site."
6. **Fallbacks:** Meta down → Baseten only ("1 model"); both down → code verdict from the spec table + measurements only; SAM down → no plate blur → don't send the vehicle photo, ask the user to pick the vehicle instead. Never crash (5.7).
7. **Cost:** ~$0.01–0.02 per check (SAM privacy pass + identify + 2 multi-image calls); picking from the list = 2 calls. Add the endpoint to the Part D rate limits. **Tests:** `pnpm test:fit` (maths cases: fits / tight / won't fit / unknown / stale-photo cap / AI can't upgrade; no AI) + one live run with a seed car photo against Kataula and Aut.

**Done when (C):** on Delhi → Manali, Kataula → "Check if my vehicle can cross" → upload a car photo → identified (or confirmed) → a report with verdict, width diagram, factors, EN/HI advice and "2 AI models agree" in ≲15 s; route rows show fit pills for the saved vehicle; matches Glass. → STOP. Wait for "continue".

#### Part D — Production hardening
1. **Production env vars:** list every required variable (Meta, Baseten, Supabase URL/anon/service, cron secret, etc.) in `.env.example` (names only, no values) and in the README. Give the user a checklist of exactly which ones to add in Vercel → Project Settings → Environment Variables. Scan the repo + git history for leaked keys (e.g. gitleaks or a grep for key patterns). Report findings; don't print any secret values.
2. **Cron jobs on Vercel:** `vercel.json` crons for news ingest and Road Watch re-check, protected by a `CRON_SECRET` header check. Keep within Vercel Hobby plan cron limits (check the current limits and adjust the frequency; document the trade-off).
3. **Demo login for judges:** a "Try as PWD Mandi (demo)" button on `/official/login` that signs into a read-mostly demo official account. Demo actions must not delete or corrupt seed data (or there's a reset script). Keep real official accounts invite-only.
4. **Rate limit / budget guard** on every AI endpoint (report, route check, investigator, advisory, image, transcription, slope reading/risk, vehicle-fit check): per-IP + per-user limits, and a global daily spend cap. When the cap is hit, use the existing code-only fallback from the provider router so the app degrades gracefully and never crashes. The "limit reached" message uses Glass styling.
5. **Error monitoring:** structured server logs readable in Vercel logs. Wrap AI/provider calls so failures log the provider, model and error code (never keys or user photos). Sentry free tier only if it takes under 30 minutes; otherwise skip it.

**Done when (D):** build passes with prod env, crons are configured and secured, demo login works, hitting the rate limit returns a friendly message, no secrets in the repo. → STOP. Wait for "continue".

#### Part E — Real data, polish, deploy, ship-ready repo
1. Real photos in the seed data (stripped EXIF, faces and number plates blurred as in Phase 1).
2. Loading, error and empty states on every screen, in Glass styling. Bug fixes from the user's phone testing.
3. Performance: image sizes/compression, caching, lazy-load heavy map layers.
4. Deploy to Vercel + Supabase production (migrations applied, storage buckets + RLS checked).
5. PWA install test checklist for a real iPhone (Safari → Share → Add to Home Screen) and Android (Chrome install prompt): manifest, all icon sizes, apple-touch-icon, splash, theme colour, standalone display, offline fallback page. Give the user the checklist to run on their phones.
6. OG image (in Pathfinder's visual style) + title + description meta (and Twitter card) so the live link previews well in Discord/submission.
7. Smoke test of the full demo path on the LIVE URL, not localhost: report → verify → route check → Start in Google Maps → Drive Watch (simulate) → Road Watch alert → slope photo → slope risk on the route → "Can my vehicle cross?" at Kataula → Command Centre (demo login, incl. "Slopes to inspect") → field update → traveller sees repairs. Give the user a step-by-step checklist and report anything that fails.
8. README: setup, architecture diagram, which Meta models do what (incl. Slope Sentinel and the vehicle-fit check), the pitch lines, what was built during the hackathon (dates), live link, demo login instructions.
9. LICENSE file (MIT) + a "Built during the Meta Global AI Developer Hackathon, Oct 27 – Nov 4, 2026" note.

**Done when (E):** live URL passes the smoke test, PWA installs on both phones, README/LICENSE complete, every screen visually consistent with the Glass design. → STOP. Wait for "continue" before Phase 7.

### Phase 7 — Ship (Wed Nov 4 evening)
`docs/demo-script.md` (3-min story: problem → report → verify → route check → Road Watch alert → Command Centre loop → impact), help record the video, final submission checklist (public repo, video link, live link, no secrets, Meta models clearly listed). **Submit Wednesday night IST.**

---

## 14. PHASE TRACKER (update at the end of every phase)

| Phase | Status | Notes |
|---|---|---|
| 0 · Setup & proof | ✅ done (Oct 28) | **A (Oct 27):** Next 15.5 + TS + Tailwind v4 (tokens go in `globals.css` `@theme`, no `tailwind.config`), pnpm, `"type":"module"`. Scripts run with plain `node` (Node 22 strips TS; imports use explicit `.ts` paths, `allowImportingTsExtensions` on) → no `tsx` dep. Router: retry/backoff, 10-min breaker, `AI_MODE`, `runJob()` never throws; `ai_calls` logging is console-only until Phase 1. **Meta works without a card** (`muse-spark-1.3`, ~$0.001/hello, ~250 reasoning tokens → use low effort for bulk). **Baseten works** (`muse-spark-open-1026`, ~1.1 s). **Baseten tool calling works** (parallel calls too) → valid agent fallback. Cookbook uses Chat Completions; Meta wants `developer` role, `tool_choice` only `auto`, no `n`/`stop`. **B (Oct 27):** Vision ✅ both providers (Meta 6 s ≈ $0.007/photo, Baseten 5–12 s; both heavy on reasoning tokens → set low effort). SAM ✅ (`@meta-sam/parser`, 0.3–2.8 s/prompt): `debris` finds NOTHING → use `rock`/`boulder` (individual stones) + `landslide` (whole slide) + `road` + `vehicle`; `excavator` finds JCBs; face/plate 0 on these photos (expected). **Hindi voice ✅:** Muse Voice Transcribe auto-detect is best (5.6 s, $0.0015/30 s, clean Devanagari) → primary. languageBias+keywords turns place names into Latin script, no gain → don't use. Baseten Spark Open + Meta Spark 1.2 audio (`input_audio` wav) both transcribe + translate well → fallbacks. Voice endpoint needs WAV (ffmpeg here; browser must send WAV or we convert — decide in Phase 1). One voice note can describe SEVERAL events (Mandi–Kullu slide + Shimla road + Darlaghat cloudburst) → claims must allow many per report. **C (Oct 27):** Map shell ✅ — MapLibre 6 + OpenFreeMap liberty restyled to Glass (`src/components/map/glassStyle.ts`), North-India pan bounds, Mandi z9, locate → blue dot; glass `Sheet` (own pointer-drag, no vaul/framer; detents 118/374/748 px verified by Playwright), floating buttons, Home sheet per frame 02 with honest empty states. Gotchas: MapLibre 6 worker must be copied to `public/vendor/` (predev/prebuild) + `setWorkerUrl`; lightningcss drops unprefixed `backdrop-filter` unless the `-webkit-` line comes FIRST; Playwright needs `proxy: HTTPS_PROXY` to load tiles. **BLOCKED:** `overpass-api.de` (and `api.open-meteo.com`) denied by environment network policy → `scripts/fetch-roads.ts` written + typechecked but NOT run; no `data/*.geojson` yet, map shows base roads only (our corridor layer + HP boundary appear automatically once `pnpm fetch-roads` writes `public/geo/*`). Supabase env vars missing → `supabase/migrations/0001_road_segments_places.sql` written, not applied. **Roads ✅ (Oct 28):** Overpass blocks the cloud container's IP (all mirrors reset) and needs a User-Agent (406 without) → ran `node scripts/fetch-roads.ts` on Dhruv's Mac, pushed to main (`328dfab`): 6,462 ways · 14,174 km · 18,280 segments (7.9 MB) · corridor layer 1,341 segs · boundary 55,728 km² (official 55,673) · NH-3 Mandi→Manali ≈121 km road length (166 km raw; one-way carriageways counted twice) ✓. Road layer screenshot ✓. Vercel: project `pathfinder1` (pathfinder1-ten.vercel.app) needs Framework Preset = Next.js. Mac pnpm 11 has a 24 h minimumReleaseAge → run scripts with plain `node`. **Supabase ✅ (Oct 28):** cloud container can't open raw Postgres (TCP 5432 blocked; egress is HTTPS-only) → DDL run once by Dhruv in the Supabase SQL Editor (`0001_road_segments_places.sql`); data loaded over HTTPS by `pnpm load-segments` (PostgREST + service role, upsert, re-runnable): 18,280 road_segments (780 NH3) + 14,677 places (`pnpm fetch-places` on the Mac → `data/places.json`: 85 towns · 14,008 villages/hamlets · 261 passes · 13 tunnels · 310 hiking routes, inside the HP boundary, merged with 27 Photon-verified demo places in `data/places-curated.json`). Lakes/valleys (Chandratal, Spiti) aren't rows (schema kinds) — Photon covers them. Overpass main server often 502s → script retries + mirrors. `segments_in_bbox` around Mandi → 133 segs (NH3, NH154, MDR23/24/26). Anon key reads both tables (RLS public select). **Future migrations in cloud sessions:** paste SQL into the SQL Editor (or run `psql` on the Mac). `NEXT_PUBLIC_SUPABASE_URL` was missing in this session → loader derives it from `SUPABASE_DB_URL`; set it to base `https://<ref>.supabase.co` before Phase 1. |
| 1 · Core engine | ✅ done (Oct 28) | **A (Oct 28):** `supabase/migrations/0002_core_schema.sql` (full section-8 schema + RLS + `photos-original` private / `photos-public` buckets + `nearest_segment()` RPC; extra cols: `photos.sha256/public_url`, `reports.event_id`, `events.summary/summary_hi/lat/lng`, `is_demo` everywhere) — **applied by Dhruv in the SQL Editor ✅** (cloud can't run DDL); end-to-end save verified (public blurred copy 200, original not public, ai_calls rows, dedupe returns the same report, `nearest_segment` → NH3). `src/lib/db/supabase.ts` (fetch-based PostgREST/Storage, no SDK). Router: `segment()` job + `ai_calls` rows (fire-and-forget). `processPhoto`: EXIF strip → 8 SAM concepts in parallel (face, license plate, road, vehicle, excavator, landslide, rock, snow ≈ $0.02/photo, 2–4 s) → pixelate+blur faces/plates (thumbnail-only if privacy SAM fails) → `measure()` (grid cross-sections across the road axis; only `landslide` can bury a full carriageway; rocks touching the edge narrow it ≤30%/side; vehicle/JCB box height = scale, rejected if road <3 or >14 m → two-lane 5.5–7.5 m assumption). Seed photos: boulders 23% blocked / ~4–6 m left; JCB slide 100% blocked. `POST /api/reports` (zod input, sha256 dedupe, uploads, rows). Test: `pnpm test:pipeline`. **B (Oct 28):** `schemas.ts` (zod Claim/ClaimSet/Verdict → `response_format: json_schema` via `z.toJSONSchema`; invalid → retried once → next provider), versioned prompts `prompts/claim.ts` + `verify.ts`, router jobs `writeClaim` (Baseten Spark Open → Meta Spark → null = pending), `verifyClaim` (Meta Spark → Baseten → rule-based), `transcribe` (Muse Voice → Baseten structured `{hasSpeech, transcript}` — plain-text fallback leaked a refusal as a "transcript", fixed). Both providers accept json_schema + `reasoning_effort: "low"`. A report = several claims (voice can name other places → `atReportLocation=false, placeHint`; stored, not yet events → TODO(phase-5) Investigator). `geo/snap.ts` (nearest_segment 300 m → 1 km, place name from `places` bbox, villages weighted ×2.5). `reports/events.ts` Verifier v1: reject → nothing; pending → only notes an existing event; accept → merge into open event on same segment (≤24 h; no segment → ~300 m box) else create; latest status wins, confidence 1−(1−old)(1−0.6·new), "clear" resolves; timeline item each time; modelsAgreed=2 only when claim + verifier are different providers and agree. `images/annotate.ts`: SVG overlay on the BLURRED copy (debris/road masks, "Debris · ~3–8 m long", "Road left ~4–6 m"/"No road left", JCB boxes, top/bottom strips) → `photos-public/{id}-annotated.jpg`. `reports/submit.ts` = full pipeline; voice = WAV only (`voice` form field). Live tests: boulders → one_lane, 2 models agree, 16–18 s total (SAM 3 s · voice 5 s · claim 4–7 s · verify 2–4 s); same spot again → merged (2 reports, conf .89→.94); JCB photo → closed. All test rows marked is_demo. Gotchas: Atal Tunnel south portal (32.364, 77.133) has no segment within 1 km (tunnel ways missing from our road layer?) → check in Part C seed; SVG text needs fonts on Vercel (check in Phase 6); `rm -rf .next` while a dev server runs breaks it — kill `[n]ext-server` first. `pnpm test:claim` runs photo→claim→verify without DB. **B+ real-data test (Oct 28):** Dhruv's Hindi memo (30 s, kept ONLY in git-ignored `data/seed/voice/hindi-note-2.{m4a,wav}` — never commit; 2 test copies also sit in the private Supabase bucket `photos-original/voice/`) → Muse Voice clean Devanagari (4–6 s) → 3 claims (photo spot + Shimla road closed + Darlaghat cloudburst, `placeHint`s) ✓. New photo `data/seed/photos/road-washout-waterfall.jpg` (road edge collapsed + water). Prompts → claim-v2/verify-v2: landslide (onto road) vs road_damage (road broke/edge washed away) vs flood_water; annotate labels "Collapsed road" for road_damage + label-overlap nudging. Repeat post merged and corrected the type to road_damage. Total 20–25 s with voice (claim on Baseten 7–8 s is the long pole). Known: status can flip one_lane↔closed between runs on the same photo (latest wins) → Phase 5 time-consistency/Investigator. **C (Oct 28):** `GET /api/events?bbox=` (open events + road ref + best photo via PostgREST embeds), `GET /api/snap?lat&lng` (no AI; "Near Aut, NH3 (auto)" pill). Map: `EventPin` (status colour, white ring, 44 px button, severity drawn on top) + `useEvents` (refetch on moveend, padded/rounded bbox) + glass `EventPeek` card on Home (type, place · road, status pill, freshness, ~% sure, "2 AI models agree", "Verify with official sources"; TODO(phase-2) link to /event/[id]). `/report` (frame 10): rear camera (getUserMedia), viewfinder, dark-glass controls, hold-to-record mic → `lib/audio/wavRecorder.ts` (ScriptProcessor → 16 kHz mono PCM16 WAV in the browser, max 60 s, no ffmpeg/dep), library picker, Video/Drive shown but disabled (TODO phase-5), "Checking your report…" step list, glass `Toast`. `/report/done` (frame 10b): map + ring at the report, accepted/pending/rejected header, AI found ("Landslide · fully blocked"), "2 AI models agree · 88%", matched reports, transcript (lang=hi), +points (25 first / 10 confirm / 5 unverified → `reports.points_awarded`). Hand-off via sessionStorage. Playwright e2e (fake camera, library upload): /report → /report/done in 18.6 s ✓. `scripts/seed.ts` (`pnpm seed`, `--wipe` deletes ALL is_demo rows): 11 hand-written corridor events (Aut one-lane, Pandoh slow, Kataula closed, Jhiri damage, Solang snow, Atal south portal one-lane snow, Sissu ice, Rohtang closure, Jalori snow, Triund clear, Darlaghat water) + 18 timeline items, fixed ids (re-run = update), each placed on the nearest vertex of the intended road from segments.geojson. Curated "aut" point is the village up the hill (3 km from NH3) → seed uses Aut town 31.7427, 77.2084; curated "darlaghat" is ~5 km off NH205 → needs a Photon check (Photon tunnel failed from the container on Oct 28 — recheck in Phase 2). Test events from the pipeline runs (Panao, Gandhi Nagar, Uba, Rahri) are is_demo too. `pnpm build` ✓, no secret names in `.next/static`. Playwright here needs `proxy: { server: HTTPS_PROXY, bypass: "localhost,127.0.0.1" }`. Open for later: crews/official account/watched trips/alerts in seed (phases 3–4), pin clustering at low zoom, mock fixtures read via fs (check Vercel tracing in Phase 6). |
| 2 · Journey | ✅ done (Oct 28) | **Pre (Oct 28):** library photos are resized in the browser to ≤1600 px JPEG before upload (Vercel's ~4.5 MB body limit); curated + DB "aut" moved onto NH-3 (31.743, 77.208); 3 stray pipeline-test events (Panao, Gandhi Nagar, Rahri) set `resolved_at` (not deleted). Vercel env vars set by Dhruv (Production). **A (Oct 28):** `GET /api/places?q=` (`lib/geo/places.ts`: our `places` prefix/contains match, same-name-within-3 km merged, towns > passes/tunnels > treks > villages; + Photon India bbox biased to HP, 5 s timeout, 1 h in-memory cache; either source down → the other still answers). `GET /api/route?from=lat,lng&to=lat,lng[&fromName&toName&depart]` → `RoutePlan` (`lib/geo/route.ts`, NO AI): OSRM (`lib/geo/osrm.ts`, alternatives=3, overview=full + per-segment annotations, 30 min cache, via-points) → **hill-road correction** (inside HP no stretch faster than 32 km/h; OSRM said Mandi→Sissu 2 h 14 m, now ~4.5 h) → HP split by `lib/geo/hpBoundary.ts` (TS module of the simplified boundary so Vercel bundles it) into legs + entry place (nearest HP place 6 → 20 km) → open events near the line inside HP (≤300 m if on a road the route uses, else ≤75 m — a side road beside NH-3 must not block NH-3) in order with ETAs incl. earlier delays (one lane +20, slow +10, unknown +5, closed = blocks) → code verdict (go "All clear" / go_with_care / delay "One lane at Aut +5" / avoid "Closed at Kataula"; "Himachal stretch:" prefix; outside-HP-only → "Pathfinder checks roads in Himachal Pradesh only") → **closed → reroute**: OSRM can't avoid points, so `detoursAround()` tries via-points on nearby NH segments (`segments_in_bbox` RPC, ≥3 km off the blocked route, ≤1.7× length). Events bbox padded ~30 km so detours see their events. Results: Mandi→Sissu: OSRM's Kataula route closed → NH-3 detour recommended, "One lane at Aut +5", 145 km, 5 h 51 m incl. ~80 min across 6 spots; Delhi→Manali: "Himachal stretch: One lane at Aut +2", enters HP near Naina Devi, ~10 h; Shimla→Narkanda + Kullu→Manali "All clear"; Delhi→Jaipur "Outside Himachal". 0.5–5 s (Delhi→Manali with detours ~15 s — OSRM demo server; cached 30 min). Home: `PlaceSearch` (debounced 300 ms, Enter picks first) + `PlaceCard` (Directions from your location or Mandi → verdict pill, time, arrive, via, delay detail, outside-HP note, "verify with official sources"), route lines on `MapView` (`routes` prop: accent 6 px + white 11 px casing, alternatives grey), fitBounds. `lib/events/queries.ts` shared by `/api/events` + the planner. Not yet: weather/rain banner (7.5b, with Risk Forecast), `/route` screen (Part C). **B (Oct 28):** Route Check agent. `POST /api/route-check {from,to,fromName?,toName?,departAt?}` → `{plan, check}` (`lib/geo/check.ts`). Budget tiers: no events on the route (or trip outside HP) → NO AI, code verdict (`codeRouteVerdict`); ≤1 event and nothing closed → **spark** tier (Baseten Spark Open → Meta Spark, effort low); several events or a closure → **wonder** tier (Meta Muse Wonder effort medium → Baseten Spark Open); last resort code verdict ("AI route check unavailable — showing the basic check"). Generic `agentLoop()` in router (cookbook 01/03: tool_choice auto, replay assistant tool_calls, one `tool` msg per call, parallel calls, max 6 turns, nudge once, final answer = `submit_verdict` tool args validated by zod `RouteVerdict` — errors go back to the model). Tools (`lib/ai/tools/routeCheck.ts`, all code): list_routes, get_events_on_route, get_event_detail (+eta_clear, last 5 timeline items), get_weather (`lib/weather.ts`, Open-Meteo hourly, next-6 h totals, retry once, 30 min cache), estimate_eta (re-times a route for another departure; events past their eta_clear.latest → cleared, inside the window → half delay / closed→30 min), get_pass_timings (static Atal/Rohtang/Jalori/Kunzum/Baralacha guidance, "verify locally"). Times passed to the model as IST ISO + clock text. `sanitize()` drops invented eventIds, forces exactly one recommended option. Cache 20 min, key = trip + 30-min departure window + event id:status:lastConfirmed (only real agent answers cached). Prompt `prompts/routeCheck.ts` (route-check-v1). Results: Mandi→Sissu (wonder, Meta): 14 tool calls in 6 turns, 30 s, **$0.18** (31k in / 3.4k out — input dominates; prompt caching could cut it) → "Wait — leave Thu 6:00 AM via NH-3" (daylight for Solang/Atal snow, Aut + Atal clearing windows passed by then), 3 options with code-computed times, Hindi headline. Manali→Solang (spark, Baseten): 5 calls, 9 s → "Go now via NH-3 — snow slow at Solang, ~10 min, 4x4/chains". Shimla→Narkanda: no AI, 1.6 s. Fallbacks tested: Meta down → Baseten ran the same tools (15 calls, 19 s, same plan); both down → code verdict in 3.4 s. HTTP repeat → cached in 1 s. `pnpm test:route-check [from to FromName ToName]`. **C (Oct 28):** screens. `/route` (frame 03, `components/route/RouteScreen.tsx`): GET /api/route first (map, line, code verdict ~1 s) → POST /api/route-check replaces it with the agent's verdict (pill, headline EN + HI, "N disruptions · km · about h", disruption rows with the agent's per-event impact → /event/[id], What-If chips or "Compare when to leave" → /route/options, "Why this advice" = reasoning + sources + "Muse Wonder agent · 16 checks", outside-HP legs row, "Watch this trip" shown but toasts "next update" — TODO(phase-3); crews link TODO(phase-4); rain banner TODO(phase-3)). Plan cached 3 min in `planRoute` so route-check reuses it (fresh agent ~20–26 s, warm caches 1 s). Home Directions → /route (Part A inline preview removed). `GET /api/events/[id]` (measurements, passability, eta_clear, sources, photos, timeline). `/event/[id]` (frame 05, `components/event/EventScreen.tsx`): title, road · since · updated, annotated photo + status chip + "See N photos", tiles (blocked stretch, road left "of ~7", clears around from eta_clear, last confirmed — debris volume TODO(phase-5)), Bikes/Cars/Buses ✓/✕/?, EN + HI summary, "Verified · 86% · 9 reports · 1 official update · 2 AI models agree", last 4 timeline items; reopening predictor/crew card/share TODO. `/event/[id]/photos` (frames 06/06b): dark viewer, "1 of N", glass strip (place · road, time · source · verified %, status chip), facts line, AI-annotated ⇄ Original (= blurred public copy; true original never public), thumbnails "+N", privacy note, Web Share / copy link (Muse Image card = phase 5). `/route/options` (frame 04): agent options best-first + BEST outline, "Arrive ~…", pros/cons, reasoning box with model + sources, "Use the 6:00 AM plan" → /route?…&depart=. Reads the check via sessionStorage (no extra AI). Demo data: photos of the 3 resolved test events moved onto seed events (boulders → Aut, JCB slide → Kataula); their baked-in annotation strip still says "Panao"/"Rahri" → redo with real seed photos in Phase 6. Router: InvalidOutputError carries usage so failed agent runs still log tokens/cost; a verdict written as plain JSON text is accepted if it validates (one Wonder run had ended without submit_verdict → Baseten fallback worked). `pnpm build` ✓ (the "0 B" next to /route + /api/route in the build table is cosmetic — both serve fine), no secret names in `.next/static`. Phase 2 spend ≈ $1.2 Meta (mostly Wonder test runs at $0.12–0.18 each) + some Baseten. |
| 3 · Nearby + live data | ✅ done (Oct 28) | **A (Oct 28):** `GET /api/nearby?lat&lng&radiusKm(5/10/25/50)[&name][&summary=0]` (`lib/events/nearby.ts`): open events in the radius ranked in code (severity × confidence × proximity 1/(1+km/10) × freshness e^(−h/24)) + summary via router `nearbySummary()` (Baseten → Meta Spark → code template; prompt nearby-v2, ≤150 chars, one `~`); **no AI when the radius has no events**; cache 10 min per area+radius+event versions (only AI answers cached). `/nearby` (frame 08): dashed accent radius circle, glass back + radius radiogroup, sheet summary (bold "Within 25 km of Mandi:") + "हिन्दी में पढ़ें" toggle + ranked rows → /event/[id]; centre = ?lat&lng&name → my location → Mandi. Home "Near you right now" row uses `summary=0` (free counts). Rain-risk chip = TODO Part C. **News ingest:** `lib/news/ingest.ts` = Meta Spark Responses API + `web_search` (cookbook 01/10; ~26–33 s, 9–11 searches, **≈$0.08–0.11/run**, mostly opened-page tokens) → Baseten parses the cited digest into zod `NewsItems` (prompt news-v1) → **code rules**: URL must be one the search actually cited/opened, publication date ≤72 h (the grounded model DOES cite year-old articles as current — this rule is essential), geocode via our places + Photon with a same-name guard (edit distance ≤1, inside HP), pin moved onto the road the article names (`onNamedRoad`: same ref ≤6 km, else any segment ≤1.5 km) so route checks see it. Merge: open event within ~2 km → `sources.news+1`, timeline kind `news` (actor = site), small confidence bump (news-only capped 0.65), never changes status/reopens; else new event, confidence ≤0.55, `place_name` = article spelling. Dedupe `news_items.url` = `url#place-slug`. UI: news-only events say "From news reports · not yet confirmed" (detail), "from news, not yet confirmed" (peek), "· news" (Nearby); Route Check tool gets `newsItems`. Cron `GET /api/cron/ingest-news[?dry=1]` (auth `lib/cron.ts`: Bearer CRON_SECRET; no secret → dev only) + `vercel.json` daily 01:30 UTC (Hobby = daily max). `pnpm ingest-news [--dry] [--demo]`. First live run: Khalota (Bilaspur, highway caved in) created from 2 articles, real data (is_demo=false). **CRON_SECRET** set in Vercel by Dhruv; Part A merged to main (squash "phase 2" commit 627c585). **B (Oct 28):** Travellers have no sign-up → `lib/me.ts`: anonymous `users` row per device, id in httpOnly cookie `pf_uid` (1 y), created only on first write (`ensureUserId`). `lib/watch/roadWatch.ts`: `watchTrip` snapshots the plan with NO AI (`planRoute(..., {fresh:true})` — new option that skips the 3-min plan cache so a just-changed event is seen) → `route_cache` = disruptions on ALL route options (id, status, title) + recommended road + bbox; `diff()` in code → new / status / cleared (+ "Best route is now via X" only alongside an event change; diffing only the best route reported old alternative-route events as "new" when NH-3 closed — fixed). **Event-driven** (5.4 rule): `roadWatchAfterChange(points)` re-checks only trips whose route bbox (±5 km) contains the changed event; called via Next `after()` from `POST /api/reports` (created/merged) and the news cron; Phase 4 official updates must call it too. Changed → `checkRoute()` (same Spark/Wonder tiers + cache as /route) re-plans → `alerts` row (kind road_watch, title "Your Mandi → Manali trip changed", body = change lines + agent headline, data {tripId, trip, url, verdict, headlineHi, changes, by}). Unchanged → no AI. Trips >12 h past departure deactivate; depart null = leave now. Sweep `GET /api/cron/road-watch` (≤25 trips, 240 s budget, daily 13:00 UTC in vercel.json — Hobby can't do 30-min crons; the event-driven path is the real one). APIs: `GET/POST /api/watch`, `DELETE /api/watch/[id]` (owner only), `GET /api/alerts` (+unread), `POST /api/alerts {read:"all"}`. UI: `/route` "Watch this trip" is a real switch (role=switch, POST/DELETE, matched by from/to names); `/alerts` (frame 09): unread = big cards (ROAD WATCH · time, title, body, "See new plan" → /route), older = compact rows (change line + trip), "Watching" list with Stop, empty state; opening marks all read; Scout cards TODO(phase-5). Home: bell unread badge, "Watching A → B" row. `pnpm test:road-watch [--user=<id>]`: demo user watches Mandi→Manali, demo closure on NH-3 at Bajaura (31.84737, 77.16884 — first try at 31.8463, 77.1647 was 409 m off the line → unchanged) → alert "New on your route: Landslide at Bajaura (closed). Wait — leave 4:00 AM via NH-3" (Wonder, ~$0.10–0.13, ~23 s incl. OSRM) → cleared → "Landslide at Bajaura no longer slows your route. Leave at 4:00 AM via NH-3 — arrive 7:41 AM". Demo device for screenshots: `pf_uid=dbf5b8bd-7e10-4e93-abcf-bcf897694ea3` (is_demo; also watches Shimla→Narkanda). `pnpm seed --wipe` now also wipes alerts, watched_trips, news_items, users. Not tested over HTTP: the `after()` hook in /api/reports (same function as the test; needs a real report). PR #8 opened (Dhruv merges all of Phase 3 at the end). **C (Oct 28):** Risk Forecast v1 = plain code, NO AI (`lib/risk/forecast.ts`, types `lib/risk/types.ts`): Open-Meteo hourly rain/prob/snow for many points in ONE request (comma lists, timezone GMT, cached 30 min per ~5 km cell) × landslide/road_damage/flood_water events started in the last 90 days within 3 km (resolved count too). `levelOf`: high = ≥15 mm in window or ≥7 mm/h; moderate = ≥5 mm or ≥3 mm/h; low = ≥1 mm & ≥50%; ≥2 slides nearby bumps +1; snow ≥1/≥5 cm → moderate/high. **Route** (`GET /api/risk/route`, same params as /api/route so the 3-min plan cache hits): samples every max(6 km, len/40) inside HP on the recommended route, window = 1 h before → 3 h after you'd be there (ETA ∝ distance × totalMin), contiguous moderate+ samples → stretches (km range, "A–B" place names, turf buffer 1.5 km polygon), headline e.g. "Rain risk near Sarkaghat (km 54–76) · ~9.4 mm rain around 4–9 AM" (live forecast, Mandi→Sarkaghat 3:30 AM). **Area** (`GET /api/risk/area`): grid step max(2, r/3.5) km inside the circle + HP, next 12 h, square cells. UI: `/route` purple banner (risk tokens, CloudRain) for moderate/high, else a calm line ("Dry along the route for your trip"), stretches drawn by `components/map/RiskLayer.tsx` (purple 22% fill, dashed; low = 10% fill); `/nearby` "Rain risk" chip (right side — left side collides with the map (i) attribution), on by default when moderate+, purple sheet card. Route verdict stays event-based (7.5b: "All clear" + purple banner); the Route Check agent still has its own get_weather tool. **Replay** (demo on dry days): `pnpm fetch-weather-replay [YYYY-MM-DD]` saves a REAL past day (Open-Meteo archive/ERA5, 144-point grid 31.0–32.5 N × 76.6–77.4 E) → `data/seed/weather/replay.json` (committed, 93 KB, default 2025-08-13 monsoon: up to ~50 mm/day around Kullu); `?replay=1` on /route and /nearby (and the APIs) maps that day onto today, repeated −1…+2 days, labelled "Replay of real rain from 13 Aug 2025 (demo)"; traced into the Vercel bundle via `outputFileTracingIncludes` in next.config.ts. Archive + historical-forecast APIs returned "Daily API request limit exceeded" from the shared container IP at first, then worked ~30 min later. Kullu 25 km replay → "Heavy rain risk in 19 areas · up to ~42.7 mm in 12 h". `pnpm test:risk` (6 scoring cases, no network + a live call). Open ideas for later: feed stretches into the Route Check agent/Road Watch alerts, finer grid on 50 km (coarse grid can miss a single shower cell). |
| — Off day | — | |
| 4 · Command Centre | ✅ done (Oct 28) | **A (Oct 28):** Invite-only official auth, no SDK: `lib/official/auth.ts` = Supabase Auth (GoTrue REST) password grant; login email is derived from the Department ID (`lib/official/dept.ts`, `pwd-mandi-demo@officials.pathfinder.invalid`, never shown); access + refresh tokens in httpOnly cookies `pf_off`/`pf_off_r`; `currentOfficial()` validates via `/auth/v1/user`, refreshes when expired, and requires a `users` row (auth_user_id) with role official/crew/admin — that row is the real gate (Supabase public sign-up is still ON in the dashboard but gives no access; Dhruv may switch it off: Auth → Sign In / Providers → "Allow new users to sign up"). `scripts/create-official.ts` (`pnpm create-official`, service role, re-runnable; default = demo account **PWD-MANDI-DEMO / himachal-demo**, shown on the login screen for judges; other accounts `--dept --name --district --role` + `OFFICIAL_PASSWORD`). `seed.ts` now also upserts 5 demo crews (Mandi A busy at Aut with 2 JCB, B/C/D free; BRO snow cutter at Atal); `--wipe` also deletes crews + official_updates + the demo official's users row → re-run `pnpm create-official` after a wipe. Districts = approximate circles in `lib/official/districts.ts` (segments have no district; Mandi = 31.70 N 77.00 E r 30 km → Mandi town, Pandoh, Aut, Kataula, Jhiri; excludes Kullu/Jalori/Khalota). **Impact = code, no AI** (`lib/official/impact.ts`, reusable as `compute_vehicle_hours` in Part B): veh/day by OSM class (trunk 6,000 · primary 3,000 · secondary 1,500 · tertiary 600), hours left from eta_clear else type/status defaults, vehicles hit = veh/day × hours (≤24 h), lost hours each (closed 2 h · one lane 20 min · slow 9 min) × confidence → vehicle-hours = ranking. APIs: `POST /api/official/login` (zod), `POST /api/official/logout`, `GET /api/official/queue` (401 when signed out). Screens: `/official/login` (frame 13, glass card over blurred map, demo note) and `/official` (frame 14 phone: glass header + Sign out, 4 stat tiles active / crews free / vehicles hit / watching, map fitted to the district's pins above the sheet, rain-risk layer from `/api/risk/area`, sheet "Priority queue · Ranked by impact": rank, dot, title, "MDR-23 · ~1,500 veh/day · 18–30 h · unassigned", status pill → /event/[id] for now — TODO(4C) → field update). Demo queue: Kataula (closed) → Uba (old pipeline test event, closed) → Aut (one lane, Crew A) → Jhiri → Pandoh. Tested with curl: redirect when signed out, wrong password 401, sign-in, refresh path, sign-out → 401; Playwright 390×844 screenshots ✓.  **B (Oct 28):** **Crew Dispatch** = code maths + agent. `lib/official/dispatch.ts`: `evaluate(plan)` simulates crews (travel from the district base or last job at 25 km/h, busy crews finish their current job first, crew on site clears the remaining work ×0.45 with ≥2 machines / ×0.6 with one, never later than without) → lost vehicle-hours next 24 h, baseline vs plan; snow-cutter-only crews only on snow/ice; traffic/accident/notice events are not crew work. `greedyPlan()` = keep busy crews + send each free crew where it saves most (≤2 jobs each). `lib/official/planDispatch.ts`: code plan instantly (GET `/api/official/dispatch`), `?ai=1` runs the agent (router `crewDispatch`: Meta Muse Wonder medium → Baseten Spark Open → code plan; prompt dispatch-v1; tools `ai/tools/dispatch.ts`: get_open_events, get_crews, get_code_plan, compute_vehicle_hours, evaluate_plan, get_weather, submit_plan). The agent's steps are re-scored by code, invalid steps dropped, and if it saves <95% of the code plan the code plan is shown. Cache 30 min per district + event/crew state. Live: Wonder 13 tool calls, ~20 s, **$0.12** (17k in / 3k out) — tested a swap (saved ~1,350) and kept the code plan (~1,700 vehicle-hours saved) with better wording + Hindi headline. **Approve** (POST same route, zod) re-checks every step against the official's district: send → `crews.current_event_id` + busy, send_later → scheduled; timeline item per event (kind official, actor org). Approving doesn't change ETAs (field updates in Part C will). **Advisory (14b)** `lib/official/advisory.ts`: router `draftAdvisory` (Baseten → Meta Spark → code template; prompt advisory-v1, times rounded to 15 min with weekday when not today), reach = active watched trips whose snapshot lists the event or whose bbox ±5 km contains it; Publish → `alerts` (kind info, data.advisory, hi, url /event/id) per watching device + timeline item "Public advisory: …"; one advisory per event per 10 min (409); officials only advise inside their district (404). Screens: dispatch card on `/official` (AI DISPATCH PLAN, headline, steps with bold crew, green "Saves about N vehicle-hours (est.)", "Why this plan" = reasoning + Hindi + checks count, Approve plan / Advisory → top event), `/official/advisory/[eventId]` (map on the event, editable ENGLISH + हिन्दी cards, reach line, Publish → back to 14 with a toast), `/alerts` shows "Official advisory" + Hindi + "See details". `requireOfficial()` guard shared by the /api/official routes; demo-account writes are is_demo. `pnpm test:dispatch [District] [--code]`. Tested over HTTP: draft (5 s), other-district 404, signed-out 401, publish → alert on the demo device, repeat → 409, approve moved 3 crews, forged crew skipped; Playwright screenshots ✓. `pnpm seed` resets crews + seed timelines after demo runs. TODO(phase-5): Muse Image share card on publish. **C (Oct 28):** **Field update (15)** `/official/field/[eventId]` (queue rows now link here): photo REQUIRED → `POST /api/official/field/check` runs `processPhoto` (SAM privacy + measure, ~$0.02, 3–5 s; cached by sha 15 min so Post doesn't re-run it; an already-posted photo → 409 "take a new photo") → returns now/baseline metrics; the AI check line is pure code (`lib/official/progress.ts`, runs live in the browser and again on the server): drop = 1 − blockedPct/baseline blockedPct (fallback debrisImagePct) vs the entered %, ±20 → ok "debris down ~80% since 1:53 PM. Consistent with 70%", else warn; "Fully open" with >35% blocked or "One lane" with ≥90% → warn; no baseline → "first progress photo"; SAM down → unknown. Segmented Clearing/One lane/Fully open (→ closed/one_lane/open), slider, "Fully open by" (HH:MM → next IST occurrence), machines text, optional WAV voice note (Muse Voice). `POST /api/official/updates` (`lib/official/fieldUpdate.ts`): photo row (source official, private original + blurred public, no annotation yet) + `official_updates` row (ai_check incl. text/level/crew/org/transcript) + event: status, passable, eta_clear (eta−90 min → eta), SAM measurements merged, code-written summary EN/HI, confidence ≥0.9 only when the photo matches, sources.official+1, last_confirmed now; Fully open → resolved_at + crew freed; timeline "Field update: 70% cleared · one lane · fully open by ~2:00 PM · 2 JCB, 1 tipper · photo matches" (or "⚠ photo doesn't match — flagged" — rule 7: flagged, not hidden) → `after()` → `roadWatchAfterChange`. **Repairs** `GET /api/repairs?ids=` (`lib/repairs/query.ts`, public, no AI): crews assigned + latest official update (48 h) per event → `Repair` (pct, fully open, machines, check, atWork = crew assigned or update <12 h). `/route/repairs` (frame 07, `components/repairs/RepairsScreen.tsx`, plan from the 3-min cache), `CrewCard` (At work pill, % bar, Now / Fully open / Machines, "Last update · photos match the update"), `/route` "N repair crews working on your route" link, event page crew card + newest official photo shown first. Shared `lib/images/shrink.ts` (browser ≤1600 px) now used by /report too. Seed re-run also deletes demo official_updates + official photos on seed events. **Done-when ✓ (HTTP + Playwright):** official posts Kataula "70% cleared, one lane, open by 2 PM" (check ok, 8 s) → event one_lane, conf .91 → Mandi→Manali route now "One lane at Kataula" via MDR-23 + "1 repair crew working" link → repairs card 70% → Road Watch alert "Landslide at Kataula is now one lane (was closed)… Go now via MDR-23" (Baseten re-plan). "Fully open" on Aut with a still-blocked photo → resolved, Crew A free, flagged on the timeline. Phase 4 spend ≈ $0.53 Wonder (dispatch test runs) + $0.10 SAM + Road Watch re-plans. Not done / later: annotated overlay on official photos, SAM progress for snow (pct vs snowCoverPct), official photo time-consistency (Phase 5). |
| 5 · Smart features | ✅ done (Oct 28) | **A (Oct 28):** **Reopening predictor + debris volume = plain code, no AI** (`lib/clearing/estimate.ts`, loader `lib/events/reopening.ts`): debris m³ ON the carriageway = blocked length × road width (SAM, else 5.5–7.5 m) × blocked % × assumed depth (≥90% buried 0.8–2.5 m · ≥40% 0.5–1.5 · else 0.3–0.8), landslides only; central value with a −40/+50% band (min×min / max×max gave a useless 7× spread). Clearing = 0.5–1 h setup + m³ ÷ (12–30 m³/h per digging machine, 2nd+ machine ×0.6), −35/+60% band; one lane = only the share between the gap and 3.5 m. Machines = latest field update (<12 h, `"2 JCB, 1 tipper"` → 2) else assigned crews. Predictor prefers the **photo sequence**: least-squares blockedPct vs time over the last 24 h (traveller + official photos; official % cleared converted against the first photo when its photo wasn't measured), ≥20 min span, rate ±30%; <2 %/h = "no progress visible yet" → falls back to the volume estimate. `debrisVolumeM3` now stored on events by reports (`applyToWorldState` merges SAM width/length under the claim) and field updates; computed on read for older events. `GET /api/events/[id]` adds `reopening`, `investigation`, `checkReason`. Event page: 4th tile = **Debris ~500–1,200 m³** (frame 05), "Clears around" falls back to the predictor marked "est.", predictor card (TrendingUp) under the summary. Seed: Kataula ~500–1,200 m³ / no machine → "times start once a machine is on site"; Aut ~80–200 m³, 2 JCB → fully open ~4–8:30 AM. `pnpm test:reopening` (9 cases, no AI). **Investigator agent** (`lib/investigate/investigator.ts`, router `investigate()`: Baseten Spark Open → Meta Spark, effort low, ≤7 turns; prompt investigate-v1; tools `ai/tools/investigate.ts`: get_event, get_claims (+report/news timeline), get_official_updates, get_reopening_estimate, get_weather, search_news (ONE grounded Meta search per run via the new generic router `groundedSearch()`, ~$0.015), request_scout_photo (→ `scout_requests` row, one open per segment, repeats raise demand_count — sending = TODO(phase-5B)), submit_findings → zod `Investigation` {finding still_there/likely_changed/likely_cleared/conflicting/no_new_evidence, suggestedStatus, confidence, explanation EN+HI, evidence[], scoutQuestion}). Triggers (`whyInvestigate`, code): confidence <60%, news-only, stale (>4 h snow/ice/traffic/water, >8 h others), eta_clear passed but not open; skips open/clear/closure_notice. **Code decides**: status NEVER changes (flag + scout request instead), confidence moves ≤±0.15/run (floor 0.15, news-only cap 0.65), timeline item kind `ai`, actor "Investigator · Muse Spark Open", data = note; one run per event per 3 h unless new evidence (`last_confirmed_at` newer). APIs: `POST /api/events/[id]/investigate` ("Check again"), `GET /api/cron/reverify` (6 most doubtful, sequential; vercel.json daily 07:30 UTC). Event page "AI check" card (finding word + colour, EN/HI, Evidence (n) disclosure, "it never changes the status itself"), shown when doubtful or checked; AI items no longer duplicated in the timeline list. Live: **Khalota** (news-only, 35 h) → searched, found a newer real article (one-way for light vehicles restored on NH-205) → likely_changed → one_lane, scout request queued, 18.6 s; **Uba** (10 h old) → still_there, 93→82%, 7.9 s, no search. Voice-note claims about OTHER places (`reports/mentions.ts`, code): place hint geocoded (`locate` from news ingest) → open event ≤5 km gets a timeline line "Also mentioned in a traveller's voice note…" (never creates/changes an event); tested Darlaghat ✓ / Shimla (no event) ✓. Also fixed `clearWindow` across midnight ("6:32 PM–tomorrow 6:32 AM"). `pnpm test:investigator [place…] [--force]` (no args = list doubtful, no AI). Not done: Road Watch isn't told about Investigator flags (status unchanged by design); predictor doesn't feed eta_clear/route ETAs yet. **B (Oct 28):** **Scout requests = plain code, no AI** (`lib/scout/requests.ts`): one open request per segment (`ensureRequest`, repeats raise `demand_count`; 12 h TTL) from the Investigator's `request_scout_photo` (dispatched right after the run) or the **data-gap scan** (`scanGaps`: open non-notice events with evidence >3 h fast types / >6 h others, score = (1 + travellers watching a trip through it) × hours old → top 5). Sending (`dispatchRequest` push + `dispatchForUser` pull on each location ping): opted-in, location not off, coarse location ≤30 min old, ≤15 km, **speed ≤10 km/h (unknown allowed)**, **max 2 a day** per scout, ≤4 scouts per request, no repeats → `alerts` kind scout_request ("Can you help travellers?" · "N travellers are watching trips through X — last photo 3 h ago. You're ~3 km away. Share a quick photo, only when safely stopped.", data {requestId, eventId, url `/report?scout=<id>`}). `/alerts`: frame-09 scout card (Share photo → /report?scout=…, Not now → `POST /api/scout/respond` marks it read). Report with `scout` form field → `fulfilled_by_report_id`, photo source `scout`, **+15 bonus** once. Reports now carry `user_id` (`ensureUserId` in POST /api/reports) and credit `users.points` (`creditUser`, first report sets `users.district` via district circles); points: +25 first · +10 confirmed · +5 unconfirmed · **−10 when the verifier rejects with ≥80% confidence** (floor 0). Location: `POST /api/me/location` (only when Location = While using; rounded to 0.01° ≈1 km, overwritten, no history; Location Off also clears it) ← `components/me/useLocationPing.ts` every 5 min while Home or /me is open. **/me** (frame 12, `components/me/MeScreen.tsx`, `GET/PATCH /api/me`, `lib/scout/profile.ts`): avatar initials + editable name (default "Scout 4F2A"), title, district, Points / Verified / First reports (first report = earliest report on that event), badges Pahad Scout (1 verified) / First Responder (first to report) / Road Guardian (10 verified, locked otherwise), district leaderboard top 3 + You (users.points, labelled "All time" — honest, frame says "This month"), points rules line, Location Off/While using, Scout requests switch ("Max 2 a day · never while driving"; turning it on turns location on), "Road crew or official? Sign in". `/report/done` shows the running total + "Me" link + scout bonus. Seed adds 4 demo scouts (Rakesh T. 1,240 · Neha S. 980 · Arjun K. 865 · Pooja R. 410, Mandi, is_demo; "Includes demo scouts" note); `--wipe` also clears scout_requests. Cron `GET /api/cron/scout-gaps` (vercel.json daily 10:00 UTC). `pnpm test:scout` (11 checks: stationary scout ✓, driver at 40 km/h ✗, location off ✗, no repeats, max 2/day, bonus once, profile; leaves demo scout `pf_uid=00000000-0000-4000-a000-000000000009` for screenshots). HTTP e2e: scout-answer report (Jalori) → accepted/merged, 10 + 15 points, request fulfilled, user total 25→50, 29.8 s (test rows then marked is_demo + unlinked, seed re-run). **Share alert card (frame 11)** `POST /api/share/[eventId]` (`lib/share/card.ts`): text = code (title "NH-3 near Aut: one lane open" with `prettyRef`, Hindi = event summary_hi, detail = reported window else predictor "Reopening estimated ~…" + "Buses wait"/"No vehicles can pass", updated time + "verify with official sources"); **illustration = Muse Image** (router `alertArt`, Responses API per cookbook 05/01, image = `image_generation_call.result`; prompt alert-art-v1: flat vector, NO text/people/plates — exact EN/HI are set by code because an image model can garble Devanagari; never fed an evidence photo) cached in Storage `photos-public/cards/alert-art-v1/{type}-{status}.jpg` (≈ a few dozen images ever; live: 15.8 s, $0.01, 19k in / 2.2k out tokens); Muse Image down → code-drawn SVG scene (`…-code.jpg`, Muse retried after 30 min). `/share/[eventId]` (`components/share/ShareScreen.tsx`): dimmed map, "Alert card · illustration by Muse Image", status-coloured "PATHFINDER ROAD ALERT" header, card, glass share row WhatsApp (wa.me) / Messages (sms:) / Copy link / Save image / More (Web Share with file). The PNG is drawn in the BROWSER on a canvas (`drawCard.ts`, 1080 px, trimmed) — phones have Devanagari fonts, Vercel's server may not. Event page: "Share alert card" button; advisory publish warms the illustration via `after()`. `pnpm test:share [eventId]` (`AI_MODE=mock` → code art). **C (Oct 28):** **Dual-model verification UI + agreement stats** (no AI, no schema change): each report's verdict is now stored as a `VerificationRecord` (`lib/verification/types.ts`: claimBy, verifiedBy, verdict, agrees, twoModels = different providers and not rules, confidence, claimed status/type, corrected status/type, reasoning) on the photo's own claim (`claims.payload.verification` — so rejected/pending reports that never reach an event still count) and on the event timeline item. `lib/verification/stats.ts`: `eventVerification(id)` (per event: checked, both agreed, disagreed, corrected, single-model, latest) and `verificationStats(days)` (agreement rate, verdict counts, corrections, model pairs, last 5 disagreements, write_claim/verify_claim median latency + avg cost per provider from `ai_calls`); older timeline items count only when `modelsAgreed = 2` (= two different models agreed), others are "not recorded". `GET /api/stats/verification[?days]`. UI: event page "Verified" card → `ModelChecks` ("Latest report, checked twice": 1 Muse Spark Open · open weights · Baseten — read the photo: landslide · slow; 2 Muse Spark 1.3 · Meta Model API — checked it on its own: agrees · 85% sure / corrected it to … / rejected; "N of M reports: both models agreed · K corrected"; link "How Pathfinder verifies"), `/verification` page (tiles Models agree % / Reports checked / Corrections, pair rows "Muse Spark Open wrote · Muse Spark 1.3 checked 7/7 agree", the 5-step pipeline, "When the checker disagreed", speed & cost per job — live: claim on Baseten ~5.9 s, verify on Meta ~3.1 s ≈ $0.0034). `/report/done` "Checked by" names both models. Stats today are thin (7 checks, all agree, incl. demo) — they fill as real reports arrive; nothing fabricated for seed events. **Stretch — time-consistency check** (code, `reports/events.ts`): (1) library photos send `takenAt` (EXIF DateTimeOriginal read in the browser before the canvas resize strips it, read as IST; else file lastModified — `lib/images/takenAt.ts`); a photo >6 h old is history only: never creates a pin or changes status, adds "Older photo (taken ~2 days ago): …" to an existing event, report pending (+5), `/report/done` says "Photo taken ~2 days ago — kept as history, not as the road's current state"; the claim writer gets the photo time and the verifier is told its age; future clocks ignored. (2) Flip-flop guard: a report contradicting a status confirmed <30 min ago with LOWER confidence doesn't flip it → timeline "Conflicting report (says closed): … · status kept", report pending, `timeCheck` explains why (fixes the Phase 1 one_lane↔closed flapping). `pnpm test:time-check` (5 cases, throwaway demo event, no AI). HTTP e2e: 50 h-old photo at Aut → pending/noted + two-model record stored on the claim. **Cut (cut order):** Drive & Map (10c) and the official notice (PDF) reader — not built; /report Video/Drive modes stay disabled. `test:scout` made repeatable (clears the demo scout's earlier demo reports). Phase 5 spend ≈ $0.03 Meta search/Investigator + $0.01 Muse Image + ~$0.09 for 3 real test reports + Baseten. |
| 6 · Polish + deploy | 🟡 A done (Oct 30) | **A (Oct 30):** All plain code, no AI. **Start** (`components/route/StartActions.tsx`, on every `/route`, incl. all-clear + Delhi→HP): primary "Start" → Google Maps `dir/?api=1` deep link; waypoints from `lib/drive/handoff.ts` `pickWaypoints()` = the point farthest from the other road in each stretch where Pathfinder's chosen route leaves the other OSRM options (≥2 km, >1 km apart), longest first, **max 3** (Google's mobile-browser limit; 9 on desktop), URL-encoded (`%2C`/`%7C`). Limit: Google's own default could differ from every OSRM option (no Google API). Mandi→Manali → 1 via point on NH-3 (Kataula closed); Delhi→Manali → 2. "…" menu → Apple Maps (start/end only) + "Apple Maps may choose a different road" note. Caption = pitch line. Secondary "Drive Watch" → `/drive?<same query>`. **Drive Watch** `/drive` (`components/drive/DriveScreen.tsx`, frame 10c scoped down): plan from the /route sessionStorage hand-off or the 3-min cached `/api/route`; `watchPosition` high accuracy → projected onto the route (`lib/drive/line.ts`, no turf in the browser) → km left, hazards ahead, arrive (est.), 10c km strip, map follows (padding keeps the dot above the sheet; pan → "Follow" button). Hazard alerts by distance ALONG the route at 5 km and 1 km (`lib/drive/hazards.ts`; announced keys per event+threshold, GPS jump inside 1 km → one alert, passed events silent), big glass banner with status colour bar + pill, spoken via `speechSynthesis` (`components/drive/device.ts`); EN/हिन्दी toggle = app language setting (localStorage `pf:lang`, default from phone language); no hi-IN voice → speaks English, Hindi on screen. "Start Drive Watch" tap unlocks speech ("Drive Watch on") + wake lock. Wake Lock API, re-acquired on `visibilitychange`; fallback hidden looping muted `public/drive/keep-awake.mp4` (+ "Keep screen on" hint); iPhone note in the footer. **Road Watch live**: polls `/api/events?bbox` every 45 s (first poll = silent baseline), same on-route rule as the planner (≤300 m same road / ≤75 m other road), new / status change / cleared → banner + voice (skipped if behind you). Off route >1 km → alerts pause. `?simulate=1`: fake GPS 0.25 km/s from 7 km before the first hazard, purple SIMULATED pill. End drive → releases lock, stops GPS + speech, back to `/route`. `pnpm test:drive` (10 checks, no network). Playwright 390×844 ✓: Mandi→Manali + Delhi→Manali simulate speak "Traffic jam, slow traffic, 5 kilometres ahead near Pandoh." then 800 m; Aut flipped to closed mid-drive → "Road Watch: changed. Landslide debris, road closed, 19 kilometres ahead near Aut. It was one lane open." (+ Hindi banner), Aut restored. Not tested: a real phone (iOS speech/wake lock) — Dhruv to try on the Vercel preview. **B–E:** ⬜ |
| 7 · Ship | ⬜ | |

**Cut order if behind schedule:** Drive & Map → Time-consistency → Notice reader → Dual-model → Leaderboard → Scout requests → What-If. Never cut Phases 6–7.

---

## 15. Final reminders for Claude Code
- Start of session → summarise + name the current phase + ask "Shall I start Phase N?" → wait.
- One phase per go. Small steps. Test as you go. Stop at the end of the phase.
- Meta APIs are new: read `docs/meta-api-reference.md` and the cookbook recipe before coding any AI call.
- Use the **Pathfinder Glass** design (section 7) and the **real OpenStreetMap map of Himachal** (section 7.6). No tab bars, no other design.
- Never commit or print keys.
- AI calls only through `src/lib/ai/router.ts`; Baseten first where possible; a provider failure must never crash a page (5.7).
- One **Part** at a time; commit + push + ask after each Part.

---

## 16. Reference links (what each is for)
| Link | Use it for | Needed in |
|---|---|---|
| https://github.com/meta-models/meta-model-cookbook | **Working code** for every Meta API feature. Clone to `vendor/` and read the recipe listed in 5.3 before writing that integration | Every phase with AI |
| `docs/meta-api-reference.md` (in repo) | Meta API facts: base URL, model IDs, prices, limits, recipe map | Every phase with AI |
| https://dev.meta.ai | Meta dashboard: API keys, Billing (credits), Usage, model docs. The **user** checks Billing/Usage here; you read docs only if a recipe is unclear | Phase 0, budget checks |
| https://api.meta.ai/v1 | Meta Model API endpoint (OpenAI-compatible) | `clients.ts` |
| https://inference.baseten.co/v1 | Baseten endpoint for Muse Spark Open (`meta-models/muse-spark-open-1026`), OpenAI Chat Completions | `clients.ts` |
| https://docs.baseten.co | Baseten docs (only if a Baseten call behaves unexpectedly) | Phase 0 |
| https://www.figma.com/design/TfO0HHtU864OIUC6fkAzCf | Pathfinder Glass prototype (all 19 screens) — mostly for the user; you use `docs/design/` | UI phases |
| https://tiles.openfreemap.org/styles/liberty | Base map style (MapLibre) | Phase 0 Part C |
| https://maplibre.org/maplibre-gl-js/docs/ | MapLibre API (layers, sources, styling) | Map work |
| https://overpass-api.de/api/interpreter | One-time download of HP roads + boundary | Phase 0 Part C |
| https://router.project-osrm.org | Routing A→B, alternatives, drive time (demo server: cache results) | Phase 2 |
| https://photon.komoot.io | Place search | Phase 2 |
| https://api.open-meteo.com | Weather + rain forecast | Phases 2–3 |
| https://supabase.com/docs (PostGIS guide) | Database, storage, auth | Phase 0 C → 4 |
| https://turfjs.org | Geo maths: segments, snapping, splitting at the HP border | Phases 0–2 |

**Cloud environment network allow-list** (if Network access is "Limited", these domains must be added): `api.meta.ai`, `dev.meta.ai`, `inference.baseten.co`, `github.com`, `codeload.github.com`, `raw.githubusercontent.com`, `overpass-api.de`, `router.project-osrm.org`, `tiles.openfreemap.org`, `photon.komoot.io`, `api.open-meteo.com`, `*.supabase.co`, `fonts.googleapis.com`, `fonts.gstatic.com`. Package managers (npm/pnpm) are already allowed.
