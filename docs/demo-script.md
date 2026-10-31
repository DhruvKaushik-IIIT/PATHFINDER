# Pathfinder — 3-minute demo script

**Goal:** in 3:00, show that Pathfinder is an *agentic road-intelligence system* (not an image analyzer): people report → two Meta models verify → agents plan, watch and dispatch → the loop closes when the road crew posts progress.

**Rubric map:** Impact (0:00–0:20, 2:45–3:00) · Use of Meta AI (model names on screen at every AI step) · Technical depth (two-model check, tools, code caps, fallbacks) · Demo (one continuous story on a real phone).

**Live URL:** https://pathfinder1-ten.vercel.app — record on the **live link**, never localhost.
Voiceover ≈ 430 words (~145 wpm). Lines in *italics* are on-screen captions to add in the edit.

---

## Before you record (10 min)

1. `pnpm demo-reset` (fresh seed times, Kataula closed again, crews reset), then `pnpm seed-slopes` if the slope sites are missing.
2. Phone: Do Not Disturb on, brightness up, battery > 50 %, Pathfinder installed to the home screen (standalone = no browser bars).
3. Have ready in the phone's photo library: one damaged-road photo you own (e.g. `data/seed/photos/road-edge-collapse-valley.jpg`) and one hillside photo (e.g. `data/seed/photos/slopes/slope-scar-above-wall.jpg`). Practise the Hindi voice note once (~8 s): *"मंडी कुल्लू रोड पर मलबा गिरा है, एक ही लेन खुली है।"*
4. On the phone, open `/route?…Mandi→Manali` once and turn **Watch this trip** ON (so the alert in Scene 4 fires). Then go back to Home.
5. Warm the caches: open Mandi → Manali once ~5 min before recording so the agent answer comes back quickly on take 1 (it re-runs if an event changed — that's fine, cut the wait).
6. Screen-record the phone (iOS Control Centre → Screen Recording, mic ON for the Hindi note) and record the voiceover separately afterwards — easier than talking while tapping.

---

## Scene 1 — The problem (0:00 – 0:20)

**Show:** 3–4 s of real footage/photos of a Himachal landslide or a jam on NH-3 (your own photos in `data/seed/photos/`), then the Pathfinder Home screen: map of Himachal, glass sheet.

**Voiceover:**
> Every monsoon, landslides and snow close the mountain roads of Himachal Pradesh. People find out from WhatsApp forwards — or when they reach the slide. Google Maps tells you traffic is slow. It doesn't tell you *why*, or whether your car can get through.
> This is Pathfinder: live, AI-verified road conditions, built on Meta's models.

*Caption: "Pathfinder · live, AI-verified roads for Himachal · built on Meta models"*

## Scene 2 — Report in 5 seconds (0:20 – 0:55)

**Do:** Home → **Report** (blue tile) → library → pick the damaged-road photo → hold the mic, say the Hindi note → send. Show the "Checking your report…" step list (speed it up 3–4× in the edit), then **/report/done**. Tap through to the event → **See photos** → toggle **AI-annotated / Original**.

**Voiceover:**
> Anyone at the spot posts a photo and, if they like, a voice note in Hindi.
> Meta's **SAM 3.1** finds faces and number plates and blurs them, then segments the debris and the road to measure what's left. **Muse Voice** transcribes the Hindi. **Muse Spark Open**, the open-weight model on Baseten, writes a structured report — and **Muse Spark 1.3** checks it independently. Two different Meta models agree, so it goes on the map: one lane open, about four metres of road left.

*Captions as each step appears: "SAM 3.1 · privacy blur + measurement" → "Muse Voice Transcribe · Hindi" → "Muse Spark Open (Baseten) writes · Muse Spark 1.3 verifies" → "2 AI models agree"*

## Scene 3 — Journey: the Route Check agent (0:55 – 1:35)

**Do:** Home → search **Manali** → Directions → `/route`. Let the verdict pill + headline appear; scroll slowly through the disruption rows, the purple **Unstable slope** banner, the rain line. Tap **"Why this advice"** to show the reasoning + "Muse Wonder agent · N checks". Quick tap on **Compare when to leave** (/route/options, BEST card), back. Then tap **Start** → Google Maps opens on Pathfinder's road (1–2 s), switch back.

**Voiceover:**
> Planning Mandi to Manali? A **Muse Wonder** agent checks the trip with real tools: routes, every event on them, weather, pass timings, slope risk. Here, the Kataula road is closed, so it sends us via NH-3, tells us when to leave, and explains why — with every patch, how long it'll take, and photos.
> On a clear day there's no AI call at all: just distance, time and "All clear".
> Pathfinder decides the safe route — Google Maps drives it.

*Captions: "Muse Wonder · tool-calling agent" · "Kataula closed → NH-3" · "Pathfinder decides the safe route, Google Maps drives it."*

## Scene 4 — Drive Watch + Road Watch (1:35 – 2:00)

**Do:** Back on `/route` → **Drive Watch** (with `&simulate=1` in the URL) → Start Drive Watch. Let it speak the 5 km hazard ("…5 kilometres ahead near Pandoh") and the slope line ("Unstable slope ahead near Aut. Don't stop for the next 2 kilometres."). Tap हिन्दी once. End drive. Then the bell badge → **Alerts** → "Your Mandi → Manali trip changed" → See new plan.

**Voiceover:**
> While you drive, Drive Watch speaks hazards ahead — in English or Hindi — and warns about unstable slopes *before* the hill comes down.
> And because I'm watching this trip, the moment that new report landed, **Road Watch** re-planned it and pinged me. It's event-driven: no AI runs unless something on my route actually changed.

*Captions: "Simulated drive" · "Slope Sentinel · warning signs, not predictions" · "Road Watch · re-plans only when the road changes"*

## Scene 5 — "Can my vehicle cross?" (2:00 – 2:15)

**Do:** Open the Aut (one-lane) event → **Check if my vehicle can cross** → pick **Toyota Innova Crysta** → show the verdict pill, width diagram, factors, Hindi advice, "2 AI models agree".

**Voiceover:**
> Not sure your car fits through the gap? The vehicle's real width comes from a spec table, the gap from SAM's measurements, the maths from code — and two Meta models look at both photos for what numbers miss, like boulders under a low car. They can only make the answer more careful, never riskier.

*Caption: "Code does the maths · AI can only lower the verdict"*

## Scene 6 — Command Centre closes the loop (2:15 – 2:45)

**Do:** `/official/login` → **Try as PWD Mandi (demo)** → stat tiles + **Priority queue · Ranked by impact** → **AI Dispatch Plan** card ("Saves about N vehicle-hours") → **Approve plan**. Tap Kataula → Field update → photo, **One lane**, slider 70 % → AI check "Consistent with 70%" → Post. Cut to the traveller's `/route`: "1 repair crew working" → repairs card at 70 %.

**Voiceover:**
> For the road department, the same data becomes a priority queue ranked by vehicles stuck — computed in code. A Muse Wonder dispatch agent plans which crew goes where, and the official approves it.
> When the crew posts "70 % cleared, one lane", SAM checks the progress photo against the earlier one — and every traveller on that route sees it, and gets a new plan.

*Captions: "Impact ranking = code" · "Muse Wonder · Crew Dispatch" · "SAM 3.1 checks the progress photo"*

## Scene 7 — Impact + close (2:45 – 3:00)

**Show:** Home map with all pins, then a title card: Pathfinder logo, live URL, repo URL, the model list.

**Voiceover:**
> Six Meta models, one loop: people report, AI verifies, agents plan, crews clear — and travellers know before they go.
> Pathfinder. Know the road before you go.

*End card:*
```
Pathfinder — know the road before you go
pathfinder1-ten.vercel.app · github.com/DhruvKaushik-IIIT/PATHFINDER
Muse Spark Open (Baseten) · Muse Spark 1.3 · Muse Wonder · SAM 3.1 · Muse Voice Transcribe · Muse Image
Built solo during the Meta Global AI Developer Hackathon, Oct 27 – Nov 4, 2026
```

---

## If something fails during the take

| Problem | Do this |
|---|---|
| Report takes > 30 s | Keep recording, cut the wait in the edit (show the step list sped up). |
| Route agent slow / "basic check" shown | Re-open the route (cached 20 min) or say "falls back to a code verdict — the app never breaks" and keep going. |
| No Road Watch alert | Make sure Watch this trip was ON *before* the report; the report must be within ~5 km of the route bbox (NH-3 near Mandi/Aut). |
| Drive Watch silent | Tap the screen first (iOS needs a gesture), check the ringer/volume; the banner still shows. |
| Demo data messed up | `pnpm demo-reset` and re-record the scene. |

## What's NOT in the video (honest scope)

Only features built during the hackathon are shown. Not claimed: turn-by-turn navigation, live traffic speeds, predictions of *when* a slope fails, Drive & Map recording mode (cut).
