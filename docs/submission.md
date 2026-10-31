# Submission text (copy-paste)

Fields below follow the usual hackathon form (Devpost-style). Edit the wording freely; keep the facts.

**Project name:** Pathfinder

**Tagline (≤ 60 chars):** Know the road before you go — AI-verified mountain roads

**Track:** Indie Developer (solo)

**Bonus prizes to tick:** Best Agentic Use-Case · Best Build on Meta Open-Weight Models (Muse Spark Open via Baseten) · Community Vote · Most Viral

**Links**
- Live app: https://pathfinder1-ten.vercel.app
- Repo (public): https://github.com/DhruvKaushik-IIIT/PATHFINDER
- Demo video: _add YouTube link_
- Demo official login: `/official/login` → **Try as PWD Mandi (demo)** (or `PWD-MANDI-DEMO` / `himachal-demo`)

---

## Short description (≤ 300 chars)

Pathfinder turns one photo or Hindi voice note into a verified, measured road event for Himachal Pradesh. Two Meta models check each other, agents plan your trip around landslides and snow, watch it while you drive, and help road crews decide which slide to clear first.

## Inspiration

Every monsoon and winter, landslides, snow and tourist jams close Himachal's mountain roads — the Mandi–Kullu NH-3, the Atal Tunnel approach. Travellers learn about it from scattered WhatsApp forwards, or when they reach the blockage. Google Maps shows *that* traffic is slow, not *why*, not whether one lane is open, not whether a bus can get through, and it's weakest exactly on the remote stretches where it matters.

## What it does

- **Report (5 seconds):** a photo plus an optional Hindi voice note. SAM 3.1 blurs faces and plates, then segments road, landslide, rocks, vehicles and JCBs to measure how much road is left. Muse Voice transcribes the Hindi. Muse Spark Open writes a structured claim; Muse Spark 1.3 verifies it independently. If they agree, it becomes (or updates) a road event with an AI-annotated photo.
- **Journey:** any A → B (including Delhi → Manali, split at the Himachal border). Zero events → a plain "All clear" with distance and time and **no AI call**. With events, a Muse Wonder agent uses tools (routes, events, weather, pass timings, slope risk, ETA re-timing) to give a verdict like "Leave 5:30 AM via NH-3", with every disrupted patch and What-If departure options. **Start** opens Google Maps with waypoints that force Pathfinder's safe road. **Drive Watch** speaks hazards ahead in English or Hindi.
- **Road Watch:** saved trips are re-planned only when an event on the route changes (event-driven, not a timer on the AI), and the traveller gets an alert.
- **Slope Sentinel:** photos of the hillside *above* the road are read for warning signs (cracks, seepage, loose rock, fresh scars), tracked over time and combined with the rain forecast and slide history into a pre-failure risk level. Advice only; it never closes a road.
- **Can my vehicle cross?** Vehicle width from a spec table, gap from SAM measurements, maths in code; two models compare the road photos and your vehicle for what numbers miss. They can only make the verdict stricter.
- **Nearby:** everything within 5–50 km, ranked, with a short summary and a rain-risk layer.
- **Command Centre (officials, invite-only):** priority queue ranked by vehicle-hours lost, a Muse Wonder Crew Dispatch agent, EN/HI public advisories, and field updates whose progress photo SAM checks against the earlier one. Updates flow straight to travellers' routes and alerts.

## How we built it

- **Meta models:** Muse Spark Open (open weights, on Baseten) is first choice for every text/vision job; Muse Spark 1.3 is the independent verifier and does grounded web search for news ingest; Muse Wonder runs the tool-calling agents (Route Check, Road Watch re-plan, Crew Dispatch, Slope risk); SAM 3.1 does segmentation, measurement and privacy blurring; Muse Voice Transcribe handles Hindi voice notes; Muse Image illustrates the shareable alert card.
- **One AI router** (`src/lib/ai/router.ts`): every output is zod-validated JSON, retries with backoff, a circuit breaker on billing/auth errors, provider fallback (Baseten ⇄ Meta), a daily spend cap, every call logged with tokens and cost, and a no-AI last resort for every job — a provider outage never crashes a page.
- **Models propose, code decides:** status changes, slope risk caps, impact ranking, clearing-time estimates and the vehicle verdict are computed in code. Every number is a range with a confidence.
- **Stack:** Next.js 15 + TypeScript on Vercel, Supabase (Postgres + PostGIS, Storage, Auth), MapLibre + OpenFreeMap, an OpenStreetMap road layer for Himachal (18,280 ~1 km segments), OSRM routing, Photon search, Open-Meteo weather, Turf.js, sharp. Phone-first "Glass" UI, installable as a PWA.

## Challenges

- Measuring metres from pixels honestly: SAM's `debris` concept found nothing on real slides, so we combine `landslide`, `rock`, `boulder` and `road` masks and use vehicles/JCBs as scale — and say "unknown" when there's no reference.
- Grounded news search sometimes cites year-old articles as current, so code only accepts URLs the search actually opened and articles ≤ 72 h old.
- Routing around a closure when the router can't avoid points: we search for via-points on nearby national highways.
- Keeping agent costs low: no AI on clear routes, Spark for simple routes, Wonder only when there are several events or a closure, and caches keyed on event versions.

## Accomplishments

- A real photo + Hindi note becomes a two-model-verified event on the map in ~20 s.
- A full loop: traveller report → agent re-plan → Road Watch alert → official dispatch and field update → every traveller on that route sees the change.
- The whole build and testing stayed far below the $150 Meta credit (every call is logged with its cost in `ai_calls`).

## What we learned

Two different models checking each other catch real mistakes; giving agents good *tools* matters more than long prompts; and on a clear day the best AI answer is often no AI call at all.

## What's next

Pilot with a district PWD office, WhatsApp bot for reporting, more districts' crew data, and official notice (PDF) reading.

## Built with

`meta-muse-spark-open` `muse-spark-1.3` `muse-wonder` `sam-3.1` `muse-voice-transcribe` `muse-image` `baseten` `next.js` `typescript` `supabase` `postgis` `maplibre` `openstreetmap` `osrm` `open-meteo` `turf.js` `vercel`

## Built during the hackathon

All code was written during the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026); the commit history on GitHub shows it.
