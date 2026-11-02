# Test log — manual testing on the live site (iPhone)

Live: https://pathfinder1-ten.vercel.app · Tester: Dhruv · Guide: Claude (no fixes unless Dhruv says "fix it").
`pnpm demo-reset` run: Nov 1 (start of testing), after F1, and at the end of testing (Nov 2). B1–B3 fixed and merged (#27, #28). Session closed.

## Status (end-to-end flows, Dhruv asked for role flows instead of UI basics)
| # | Flow | Status |
|---|---|---|
| F1 | Incident loop: traveller reports → AI verifies → PWD office queue → crew builder → Neelam (crew) on site → field update + voice → traveller sees repairs / note / Road Watch alert → fully open → resolved, crew released | ✅ passed Nov 1 (bugs B2, B3) |
| F2 | Traveller AI: Route Check agent verdict, What-If, Avoided on this trip, vehicle fit, share card, Start in Google Maps, Drive Watch simulate (EN/हिन्दी voice) | ✅ tested by Dhruv on his own (Nov 2), no bugs reported |
| F3 | Slope Sentinel: slope photo → 2-model reading → risk → route banner → Command Centre "Slopes to inspect" | ✅ tested by Dhruv on his own (Nov 2), no bugs reported |
| F4 | Doubt loop: event goes Unconfirmed / "Still there?" votes close it early / Investigator "Check again" | ✅ tested by Dhruv on his own (Nov 2), no bugs reported |
| F5 | Office advisory → travellers watching get it in /alerts (EN + हिन्दी) | ✅ tested by Dhruv on his own (Nov 2), no bugs reported |
| F6 | Scout loop: Me & Scout settings → scout request alert → photo → bonus points | ✅ tested by Dhruv on his own (Nov 2), no bugs reported |
| F7 | PWA install, offline page, link preview | ✅ tested by Dhruv on his own (Nov 2), no bugs reported |

Legend: ✅ passed · ❌ failed (see bugs) · ⚠️ passed with minor issues · ⏳ in progress · ⬜ not tested

## Bugs
_Format: ID · date · area · steps · expected · actual · likely cause · severity (blocker / major / minor / cosmetic)._

### B1 · Nov 1 · Report · location is live GPS only
- **Steps:** open /report on a phone that is not in Himachal (e.g. Delhi) and send a photo.
- **Expected:** a tester or judge outside Himachal can still put a report on an HP road (pick a spot / use the photo's location).
- **Actual (from code + `/api/snap` on Delhi coords):** `ReportScreen.tsx` uses `navigator.geolocation` only (the `?lat&lng` fallback works only for slope links when location is denied). A Delhi report snaps to no road (`placeName null`) and creates an event in Delhi, outside any district, so it never reaches the PWD Mandi queue. Outside lat 26–35 / India (e.g. a judge in the US) `POST /api/reports` rejects it (zod `lat.min(26).max(35)`).
- **Likely cause:** design assumes the reporter stands at the incident; no "pick location on map" option.
- **Severity:** major for the judges' demo / remote testing (fine for real use).
- **Status: FIXED (Nov 2, option A, Dhruv said "fix it")** — "Not in Himachal? Pick a spot" on /report (`components/report/PickSpot.tsx`): opens by itself when GPS is off or outside Himachal (or tap the location pill); 5 demo spots in PWD Mandi's district or "Drop a pin on the map" (snaps to our road layer). Report = demo data marked "placed on map (demo)", same AI checks, no points, never touches real events, expires like a real report. Verified locally (Playwright, GPS = Delhi → Mandi spot → library photo → accepted, 2 models agree, 30 s, event is_demo + placed, in the PWD Mandi queue, lifecycle expires in 24 h; far-off pin → 422). Test event resolved afterwards. Live only after merge to main.


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
- **Status: FIXED (Nov 2)** — `tripTitle()` in `src/lib/watch/types.ts`: "Your trip to Manali changed" when the start is "Your location", else "Your Mandi → Manali trip changed"; slope alerts use it too ("Unstable slope on your trip to Manali"). `pnpm test:hindi` checks both.

### B3 · Nov 1 · Report · Hindi summary in Latin script
- **Steps:** send a road photo (F1 report, event 1fd7d704…).
- **Expected:** `summary_hi` in Devanagari (rule 7.7: Hindi where it helps, `lang="hi"`).
- **Actual:** "Bhusklhan se sadak ki ek lane band hai…" (romanised Hindi, also a misspelling of भूस्खलन), shown on the event page Hindi line.
- **Likely cause:** claim writer (Baseten, claim-v3) ignores "(Devanagari)" sometimes; unlike the fit check there is no code check for Devanagari characters on `summaryHi` in `writeClaim` (schemas.ts:34 is only a description).
- **Severity:** minor.
- **Status: FIXED (Nov 2)** — `ensureHindi()` in `src/lib/ai/router.ts`: a Hindi summary with <5 Devanagari letters is re-translated from the English sentence by a small job (`translate_hindi`, Meta Spark → Baseten, prompt hindi-v1, zod refine = Devanagari), in parallel with the verifier; if both fail the Hindi line is left empty (hidden) instead of wrong. Used for road claims and slope readings. Not a JSON-schema `pattern` (that made Baseten answer "स" in Phase 6C). Live: the very next Baseten claim was Latin again → repaired in 2.6 s, $0.003, total report 19.5 s. Existing open events repaired once (Mandi test report, Archhandi demo).

### B4 · Nov 2 · Report · a downloaded internet photo becomes a "verified" landslide
- **Steps:** Dhruv (at home in Mandi) picked a random landslide photo downloaded from the internet from the library on /report (location: Samkhetar road, Mandi).
- **Expected:** a photo that wasn't taken here and now should not put a verified pin on the map.
- **Actual:** accepted, "2 AI models agree", 95%, event `1fd7d704…` "Landslide at Mandi · one lane" on `samkhetar-road-62229238-0` (1 report, real data, still open).
- **Likely cause:** (1) both models only judge "is this a landslide photo", not "was it taken here, now"; (2) `src/lib/images/takenAt.ts` falls back to the file's last-modified time when there is no EXIF date, and a downloaded file's last-modified = download time → the time-consistency check sees a "fresh" photo; (3) one report alone is enough to create an active pin; (4) no one can flag a pin as fake (only "Still there? No", which needs you within 2 km).
- **Severity:** major (trust / demo credibility). Options discussed with Dhruv, not decided yet.
