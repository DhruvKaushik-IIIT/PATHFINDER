# Test log — manual testing on the live site (iPhone)

Live: https://pathfinder1-ten.vercel.app · Tester: Dhruv · Guide: Claude (no fixes unless Dhruv says "fix it").
`pnpm demo-reset` run: Nov 1 (start of testing).

## Status (end-to-end flows, Dhruv asked for role flows instead of UI basics)
| # | Flow | Status |
|---|---|---|
| F1 | Incident loop: traveller reports → AI verifies → PWD office queue → crew builder → Neelam (crew) on site → field update + voice → traveller sees repairs / note / Road Watch alert → fully open → resolved, crew released | ⏳ in progress |
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
