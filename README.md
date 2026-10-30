# Pathfinder — AI-verified road & trek conditions for Himachal Pradesh

Built during the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026) with Meta's Muse models.
**"Pathfinder decides the safe route, Google Maps drives it."**

_Full setup guide, architecture and model map: coming in Phase 6E._

## Environment variables

Names only live in [`.env.example`](.env.example). Never commit values — the repo is public.

| Variable | Where | Required | What |
|---|---|---|---|
| `MODEL_API_KEY` | server | yes | Meta Model API: Muse Spark 1.3, Muse Wonder, Muse Image, Muse Voice Transcribe, SAM 3.1 |
| `BASETEN_API_KEY` | server | yes | Baseten: Muse Spark Open (open weights) |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | yes | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | yes | public by design; RLS allows public reads only |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | all writes; never prefix with `NEXT_PUBLIC_` |
| `CRON_SECRET` | server | yes (prod) | protects `/api/cron/*`; without it production refuses every cron call |
| `AI_DAILY_CAP_USD` | server | no (10) | global AI spend cap per IST day → no-AI fallbacks above it |
| `AI_MODE` | server | no (`auto`) | `mock` = fixtures only, no AI calls |
| `OSRM_URL` | server | no | routing server (public OSRM demo by default) |
| `NEXT_PUBLIC_MAP_STYLE_URL` | client | no | OpenFreeMap style |

### Vercel checklist (Project → Settings → Environment Variables, Production + Preview)

1. `MODEL_API_KEY`, `BASETEN_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — mark **Sensitive**.
2. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `CRON_SECRET` — a new random value (e.g. `openssl rand -hex 32`), Sensitive.
4. Optional: `AI_DAILY_CAP_USD` (default 10).
5. Framework preset = Next.js; redeploy after changing variables.

## Production safety (Phase 6D)

- **Cron jobs** (`vercel.json`, all daily — Hobby allows 100 jobs, once a day, ±59 min): news ingest 01:30 UTC, Investigator re-verify 07:30, scout gaps 10:00, Slope Sentinel 11:30, Road Watch sweep 13:00. Road Watch itself is event-driven (runs right after a report / news item / field update); the daily sweep is a safety net. Each cron route checks `Authorization: Bearer $CRON_SECRET` (constant-time).
- **Rate limits** on every AI endpoint, per IP and per device (`src/lib/guard/rateLimit.ts`), with a friendly "try again in N minutes" message; **daily spend cap** (`src/lib/ai/budget.ts`) checked by every AI job — above it the app uses its no-AI fallbacks instead of failing.
- **Demo login for judges:** "Try as PWD Mandi (demo)" on `/official/login`. The demo account only changes demo data; its advisories reach demo devices and the judge's own phone, never real travellers. Reset everything it touched with `pnpm demo-reset`.
- **Logs:** every AI call is one JSON line in the Vercel logs (purpose, provider, model, tokens, cost, latency, error kind, HTTP status) and a row in `ai_calls` — never keys, photos or voice notes.
- **Secret scan:** `pnpm scan-secrets` (working tree + full git history).
