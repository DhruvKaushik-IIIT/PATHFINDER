# Test log — manual testing on the live site (iPhone)

Live: https://pathfinder1-ten.vercel.app · Tester: Dhruv · Guide: Claude (no fixes unless Dhruv says "fix it").
`pnpm demo-reset` run: Nov 1 (start of testing) and again after F1.

## Status (end-to-end flows, Dhruv asked for role flows instead of UI basics)
| # | Flow | Status |
|---|---|---|
| F1 | Incident loop: traveller reports → AI verifies → PWD office queue → crew builder → Neelam (crew) on site → field update + voice → traveller sees repairs / note / Road Watch alert → fully open → resolved, crew released | ✅ passed Nov 1 (bugs B2, B3) |
| F2 | Traveller AI: Route Check agent verdict, What-If, Avoided on this trip, vehicle fit, share card, Start in Google Maps, Drive Watch simulate (EN/हिन्दी voice) | ⬜ |
| F3 | Slope Sentinel: slope photo → 2-model reading → risk → route banner → Command Centre "Slopes to inspect" | ⬜ |
| F4 | Doubt loop: event goes Unconfirmed / "Still there?" votes close it early / Investigator "Check again" | ⬜ |
| F5 | Office advisory → travellers watching get it in /alerts (EN + हिन्दी) | ⬜ |
| F6 | Scout loop: Me & Scout settings → scout request alert → photo → bonus points | ⬜ |
| F7 | PWA install, offline page, link preview | ⬜ |

Legend: ✅ passed · ❌ failed (see bugs) · ⚠️ passed with minor issues · ⏳ in progress · ⬜ not tested

## Bugs
_Format: ID · date · area · steps · expected · actual · likely cause · severity (blocker / major / minor / cosmetic)._

### B1 · Nov 1 · Report · location is live GPS only
- **Steps:** open /report on a phone that is not in Himachal (e.g. Delhi) and send a photo.
- **Expected:** a tester or judge outside Himachal can still put a report on an HP road (pick a spot / use the photo's location).
- **Actual (from code + `/api/snap` on Delhi coords):** `ReportScreen.tsx` uses `navigator.geolocation` only (the `?lat&lng` fallback works only for slope links when location is denied). A Delhi report snaps to no road (`placeName null`) and creates an event in Delhi, outside any district, so it never reaches the PWD Mandi queue. Outside lat 26–35 / India (e.g. a judge in the US) `POST /api/reports` rejects it (zod `lat.min(26).max(35)`).
- **Likely cause:** design assumes the reporter stands at the incident; no "pick location on map" option.
- **Severity:** major for the judges' demo / remote testing (fine for real use).


### F1 run · Nov 1 ~1:25–1:35 AM IST (verified in the DB)
- Traveller report from Mandi (photo, no voice note attached) → Baseten claim landslide · one lane → Meta verifier agrees 95% → new event "Landslide at Mandi" (samkhetar road), 2 models agree, +25 points. SAM said 0% blocked; the model overrode it with reasoning (as designed).
- Watched trip "Your location → Manali" created.
- Office built Crew Kataula (18 people, 3 JCB + 6 tippers incl. Neelam) → 18 crew alerts → Neelam acknowledged + arrived → 2 field updates 25% one lane (random photo → AI check correctly **flagged** "photo shows ~100% down but you entered 25%") + Hindi voice notes translated EN/HI → Road Watch alert to the traveller ("Kataula is now one lane…", Wonder/Spark re-plan) → Fully open (photo matches) → Kataula resolved, crew done, people + machines back in the pool → second Road Watch alert ("Kataula no longer slows your route… leave ~5 AM").
- Route then switched to MDR-23 via Kataula, so Pandoh + Aut correctly dropped off the trip ("no longer slows your route").

### B2 · Nov 1 · Road Watch · "Your Your location → Manali trip changed"
- **Steps:** on /route from "Your location" (Home → Give Directions) turn on Watch this trip; let an event on it change.
- **Expected:** "Your trip to Manali changed" / "Your Mandi → Manali trip changed".
- **Actual:** alert title "Your Your location → Manali trip changed".
- **Likely cause:** `src/lib/watch/roadWatch.ts:187` builds `Your ${name} trip changed` and the trip's from name is the literal "Your location".
- **Severity:** cosmetic (visible in /alerts and in the demo).

### B3 · Nov 1 · Report · Hindi summary in Latin script
- **Steps:** send a road photo (F1 report, event 1fd7d704…).
- **Expected:** `summary_hi` in Devanagari (rule 7.7: Hindi where it helps, `lang="hi"`).
- **Actual:** "Bhusklhan se sadak ki ek lane band hai…" (romanised Hindi, also a misspelling of भूस्खलन), shown on the event page Hindi line.
- **Likely cause:** claim writer (Baseten, claim-v3) ignores "(Devanagari)" sometimes; unlike the fit check there is no code check for Devanagari characters on `summaryHi` in `writeClaim` (schemas.ts:34 is only a description).
- **Severity:** minor.
