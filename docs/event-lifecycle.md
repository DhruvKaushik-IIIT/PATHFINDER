# Event lifecycle: shelf life, "Still there?", auto-close

> Design agreed with Dhruv on Nov 1, 2026 (not built yet). Status of each part is at the bottom.

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
| Road damage | one lane | 5 days ⚠ to confirm | 2.5 days |
| Road damage | closed | 7 days ⚠ to confirm | 3.5 days |
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
Details (speed threshold, how many passes) decided when building Part C.

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
| A | Shelf life, Unconfirmed state, auto-close, pothole sizes | ⬜ |
| B | "Still there?" taps | ⬜ |
| C | Drive Watch passing traffic + Investigator news → Unconfirmed | ⬜ |
