# Event lifecycle: shelf life, "Still there?", auto-close

> Design agreed with Dhruv on Nov 1, 2026. Parts A, B and C built Nov 1 (see bottom).

## Why
Pathfinder is not yet used by PWD, so nobody may tell us when a road is cleared.
Today an event only closes when a traveller posts a "clear" photo or an official posts "Fully open".
Without that, a day-1 report would block routes forever. Events must fade out on their own.

## 1. Shelf life
Time an event stays **without a new confirmation** (photo report, official update, or a "Yes" tap).
The clock starts at `last_confirmed_at`. At **half** the shelf life the event becomes **Unconfirmed**;
at **full** shelf life it is **closed automatically**.

| Type | Status | Shelf life | Unconfirmed at |
|---|---|---|---|
| Traffic jam | slow | 6 h | 3 h |
| Accident | slow / one lane | 6 h | 3 h |
| Accident | closed | 12 h | 6 h |
| Ice | any | 24 h | 12 h |
| Snow | slow / one lane | 24 h | 12 h |
| Snow | closed | 48 h | 24 h |
| Water on road | slow / one lane | 24 h | 12 h |
| Water on road | closed | 48 h | 24 h |
| Landslide | slow | 24 h | 12 h |
| Landslide | one lane | 48 h | 24 h |
| Landslide | closed | 72 h | 36 h |
| Road damage | one lane | 5 days (default, not objected to) | 2.5 days |
| Road damage | closed | 7 days | 3.5 days |
| Pothole · medium | slow | 14 days | 7 days |
| Pothole · severe | one lane | 21 days | 10.5 days |
| Closure notice | — | notice end date, else 72 h | half |
| Other | any | 24 h | 12 h |

### Potholes (common in India → size matters)
The claim AI rates the pothole **minor / medium / severe** against reference objects (lane, wheels, bike); the verifier checks it.
- **Minor** (car slows a little): **no event**, no pin, no delay, no alert. Kept as a "rough road" note on the stretch (30 days).
- **Medium** (cars crawl, bikes swerve): event, status slow, +10 min.
- **Severe** (crater over half a lane, can damage a car or throw a bike): event, status one lane, like road damage.

### Extra rules
- **News-only events** (no photo): half the shelf life.
- **Official reopening time passed** (e.g. "fully open by 2 PM", it's 2 PM, no new update) → Unconfirmed immediately.
- **Demo events (`is_demo`) never expire**, so judges see the full demo weeks later.

### What each state means
| State | Map / lists | Route time | Road Watch / Drive Watch |
|---|---|---|---|
| Active | status colour | delay added | alerts |
| Unconfirmed | **grey**, "Unconfirmed · last report 2 days ago" | **no delay** | no new alerts |
| Expired | removed | — | — |

Auto-close writes a timeline item: "No new reports for 3 days, removed automatically."
Runs in the existing daily cron + on read (code only, no AI).

## 2. "Still there?" (one-tap check)
**Who is asked:** only people **near the spot** and moving **≤ 20 km/h** (Scout *photo* requests stay at ≤ 10 km/h):
- Drive Watch, after passing the spot, once slowed/stopped or on End drive;
- the event page, only if your location is within ~2 km;
- an alert to nearby stopped users (Scout rules, max 2 a day).

**Never asked** about an expired event (it's gone; if it's really still there, the next photo creates a new event).
Unconfirmed events are asked about first.

**Safety:** "Passengers, or only when safely stopped". One question at a time, big buttons (≥ 56 px), no typing, auto-hides after 20 s, no sound/voice.

**Multiple choice only, max 2 taps:**
1. `Still there?` → **Yes** · **No, it's gone** · *Didn't see it* (closes, no vote)
2. On Yes → `How is it now?`

| Answer | Effect on the clock |
|---|---|
| Worse than shown | full shelf life from now + 50% |
| About the same | full shelf life from now |
| Partly cleared | half shelf life from now |
| Almost clear | quarter shelf life from now, counts as ½ No |
| No, it's gone | 1 No → Unconfirmed at once · 3 No (different devices, 6 h, no Yes after) → closed early: "Closed early: 3 travellers said it's gone" |

Hindi buttons follow the app language (हाँ / नहीं, हट गया / ध्यान नहीं दिया …).

**Taps never change the status** (closed → one lane still needs a photo or an official update). They only move the clock and confidence.
**Anti-spam:** one vote per device per event per 6 h; voter must be near the spot.

**Who decides:** plain **code** maps the answer to the clock (instant, free, predictable). **Meta AI (Investigator, Muse Spark Open)** steps in only when evidence conflicts (Yes vs No votes, or votes vs news), explains it, and may move the event to Unconfirmed or ask for a Scout photo. It never closes an event.

## 3. Passing traffic (Drive Watch)
If Drive Watch users pass the spot at normal speed, the road is open there → counts like a "No" vote. Free, no AI.
Decided in Part C: timed over a 600 m window centred on the spot (entered before it, stayed ≤150 m off the route, measured over ≥400 m). Closed road + ≥10 km/h → counts as a full No; traffic jam / accident + ≥30 km/h → full No; one lane / slow / other + ≥30 km/h → half a No; slower → no signal. One pass per device per event per 6 h. Real GPS only, never a simulated drive.

## 4. Investigator + news
If the Investigator finds news that the road reopened → the event goes straight to **Unconfirmed**. Still never closes it.

## Edge cases
| Case | What happens |
|---|---|
| Day-1 report, cleared on day 4, nobody tells us | Unconfirmed at half life (no delay), auto-closed at full life |
| Road still blocked but nobody reports | It still expires; next photo report creates a fresh event. Every status shows freshness + "verify with official sources" |
| A few joke "No" votes | Need 3 different devices near the spot within 6 h, and a later Yes cancels them. Status never changes from taps |
| Someone far away voting | Not shown the buttons (needs location ≤ 2 km) |
| Driver at speed | Not asked above 20 km/h; card auto-hides, no sound |
| Normal small potholes | Not an event, so no spam alerts |
| Official gave an ETA that passed | Unconfirmed straight away |
| Demo data | Never expires |
| Yes and No votes conflict | Investigator (Meta AI) weighs it and explains |

## Build plan & status
| Part | Content | Status |
|---|---|---|
| A | Shelf life, Unconfirmed state, auto-close, pothole sizes | ✅ Nov 1 |
| B | "Still there?" taps | ✅ Nov 1 |
| C | Drive Watch passing traffic + Investigator news → Unconfirmed | ✅ Nov 1 |

## Part A — how it was built (Nov 1)
- `src/lib/events/lifecycle.ts`: `shelfLifeH()` + `lifecycleOf()` (pure, client-safe). Tests: `pnpm test:lifecycle` (20 checks).
- `src/lib/events/expire.ts`: `closeExpired()` (resolved_at + timeline "… removed automatically", actor "Pathfinder (automatic)", idempotent), `sweepExpired()` (real events only; **events with a crew assigned are never auto-closed**, they stay Unconfirmed; closing triggers Road Watch), `maybeSweepExpired()` = lazy sweep on reads, at most every 10 min per instance (Vercel Hobby crons are daily). Daily cron: `/api/cron/reverify` sweeps first.
- Every `MapEvent` carries `lifecycle`; expired-but-not-yet-closed is shown as Unconfirmed.
- Unconfirmed → route planner: no delay, never blocks (so verdicts, Road Watch, the agent's delays and Drive Watch ignore it); Route Check agent tool says `unconfirmed`; Nearby ranks it ×0.3 and tells the summary model; Top 10 excludes it; Road Watch snapshot keeps it (going grey is not an alert, expiry is); Drive Watch doesn't announce it and doesn't call it "cleared".
- UI: grey pin, peek line, route row "Unconfirmed · last report 30 h ago · was one lane · no delay counted", Nearby row, Command Centre pill, event page grey card ("Removed automatically around …").
- Verifier: merges into any open event still within its shelf life (was: 24 h window); an expired one is closed first and the report starts a fresh event. Real reports still merge into demo events (no duplicate pins).
- Potholes: `potholeSize` in Claim (claim-v3) + `correctedPotholeSize` in Verdict (verify-v3), optional fields. minor → no event (report accepted, "/report/done" says "saved as a rough-road note"); medium → slow; severe → one lane; stored in `events.measurements.potholeSize`. The rough-road note lives only in the report's claim for now (not drawn on the map).
- No schema change, no AI cost.

## Part B — how it was built (Nov 1)
- **Storage (no schema change):** `events.sources.taps` = `{at, factor, noAt, nos:[{d, at, w}]}` (`Taps` in `lifecycle.ts`).
  A Yes sets `last_confirmed_at = now` + `factor` (worse 1.5 · same 1 · partly 0.5 · almost clear 0.25); `lifecycleOf` scales the shelf life by it only while that tap is the latest confirmation (a later photo resets to ×1).
  A No sets `noAt` → Unconfirmed at once ("A traveller passing by said it's gone"); confidence +0.05 per Yes, −0.1 per No (floor 0.15).
  Each tap = timeline line (kind report, actor "Traveller (one tap)", `data.tapBy` = device id) → also the 1-per-device-per-6-h check.
- **Close early:** No-weight ≥ 3 within 6 h (one per device, its heaviest; No = 1, Almost clear = ½; a full Yes clears earlier Nos) → `closeExpired` "Closed early: 3 travellers passing by said it's gone" + Road Watch. Demo events record taps but never close.
- **API:** `POST /api/events/[id]/still-there {answer, lat, lng, speedKmh?}` (`lib/events/stillThere.ts`): 410 removed · 422 > 20 km/h · 403 > 2 km from the spot · 409 already answered; rate limit bucket `tap` [6/min, 30/h].
- **UI:** `components/event/StillThere.tsx` (2-step multiple choice, buttons ≥56 px, EN/हिन्दी from `pf:lang`, "Didn't see it" = no vote, safety line). `StillThereNearby` on the event page (and in alerts): quietly checks location if already allowed, else a "Near this spot?" link; shown only within 2 km and not answered in 6 h (localStorage `pf:tap:<id>`).
- **Drive Watch:** every issue on the chosen route incl. Unconfirmed ones; spots passed since you started (≤15 km back) are queued; asked when GPS speed ≤ 20 km/h (GPS speed, else from fixes) and no hazard banner; auto-hides after 20 s; at **End drive** the remaining questions are asked first, then back to /route. Simulate mode asks at End drive (answers as if at the spot, labelled SIMULATED).
- **Alerts:** `lib/scout/stillThere.ts` on a scout's location ping (`/api/me/location`, only when no photo request was sent): opted-in, location on, ≤20 km/h, shares the 2-a-day Scout budget; event within ~2.5 km, Unconfirmed first, else ≥¼ into its shelf life; never the same event twice; demo events only for demo users. Alert kind `scout_request` with `data.stillThere` → inline card in /alerts.
- **Tests:** `pnpm test:lifecycle` (32 checks incl. 12 for taps). HTTP e2e on throwaway events: Yes·partly → confirmed now, shelf life 24 h; 1 No → Unconfirmed; same device again → 409; 3rd device's No → closed early + timeline; far → 403, 45 km/h → 422, removed → 410; alert: 40 km/h → none, stopped → asked, again → none. Screenshots: event page card (both steps), Drive Watch End-drive card, /alerts card. Test rows marked is_demo.

## Part C — how it was built (Nov 1)
- **Passing traffic:** `passWeight()` + `recordPass()` in `lib/events/stillThere.ts`, `POST /api/events/[id]/passed {lat, lng, avgKmh}` (rate bucket `tap`; ≤0.5 km from the spot; one per device per 6 h via `data.passBy`, separate from taps so the driver can still answer "Still there?"). A pass is a No vote in `sources.taps.nos` (weight 1 or ½; same device's pass + tap count once); a full-weight pass makes the event Unconfirmed with the reason "A car drove through at ~52 km/h (Drive Watch)"; confidence −0.05 × weight; timeline "Drive Watch: a car passed through at ~52 km/h — looks open" (actor "Drive Watch (automatic)"). 3 weight → closed early "…passed through it or said it's gone".
  Drive Watch (`DriveScreen.tsx`): for every issue on the chosen route, records time + km when you enter the window and posts the average speed when you leave it.
- **Investigator news:** when the Investigator's finding is `likely_cleared` (or `likely_changed` → open) AND it cited news URLs, it sets `sources.taps.doubtAt/doubtReason` ("Recent news says the road has reopened (AI check)") → Unconfirmed at once. A later photo/Yes wins. It still never closes or changes the status.
- **Tests:** `pnpm test:lifecycle` 40 ✓ (6 pass weights, 2 doubt rules). Live: crawl 5 km/h → no signal; 40/35/50 km/h from 3 devices through a closed spot → closed early with timeline; same device twice → counted once; 2 km away → refused. Browser: fake real-GPS drive (Playwright geolocation, ~54 km/h) through a traffic jam on NH-3 → Drive Watch posted avgKmh ≈ 52 → event Unconfirmed. The Investigator news path is covered by the rule test only (a live run needs real news and costs ~$0.02).

## Multi-user sync (Nov 1, after Part C)
Many cars on one spot at the same moment, many spots at once:
- **Gap found:** votes, passes, reports, news and AI checks did read → modify → write on `events.sources` / `confidence`; parallel writers overwrote each other. `pnpm test:concurrency` before the fix: 20 phones voting at once → **1–2 of 20 kept**, 10 passes → 1–2 kept, 5 report bumps → 3, a 5× double-tap accepted 5×.
- **Fix:** migration `0005_event_votes.sql` (run by Dhruv in the SQL Editor): `events.rev` bumped by a trigger on every update; `event_votes` (event, device, kind, 6-h bucket) primary key; index on `event_timeline.at`. Code: `src/lib/events/mutate.ts` — `mutateEvent()` (re-read, compute from the fresh row, `update … &rev=eq.<read rev>`, retry with back-off up to 12×), `claimVote()` (atomic insert-if-absent → exactly one of N simultaneous taps from one phone counts), `bumpReports()`. Used by taps, passes, the Verifier (all 4 report paths), news merges, the Investigator (applies its confidence *step* to the fresh row, not an absolute value) and field updates. Before 0005 is applied it falls back to plain updates and logs `migration_0005_missing` once.
- **Freshness for other users:** `dataVersion()` now also watches the newest `event_timeline.at`, so any vote / pass / news / AI check refreshes cached route plans, Nearby, Top 10 and the edge cache at once (was: up to ~3 min late for "No" votes).
- **Known limit (honest):** a voter = an anonymous phone cookie, and location/speed come from the phone. Clearing cookies 3× with a faked location could close an event early; every early close is visible on the timeline. Real accounts / verified location are out of hackathon scope.
