# Live smoke test + phone install checklist (Phase 6E)

Live URL: **https://pathfinder1-ten.vercel.app** · run on a real phone, over mobile data if you can.
Before recording the demo video: `pnpm demo-reset` (fresh seed times, Kataula closed again) and, if needed, `pnpm seed-slopes`.

## A. Install as an app

**iPhone (Safari)**
1. Open the live URL in **Safari** (not Chrome).
2. Share → **Add to Home Screen** → the name says "Pathfinder" and the icon is the blue mountain → Add.
3. Open it from the home screen: no Safari bars (standalone), a light-green launch screen with the icon, then the map.
4. Turn on Airplane mode → open the app → "You're offline" card → turn Airplane mode off → **Try again** works.

**Android (Chrome)**
1. Open the live URL in Chrome → menu ⋮ → **Install app** (or the install banner).
2. The icon is the blue mountain (round mask looks right), the app opens full screen.
3. Airplane mode → "You're offline" card → back online → Try again.

**Link preview:** paste the live URL in WhatsApp / Discord → card with "Pathfinder — know the road before you go" + the map image.

## B. Demo path (what each step should show)

| # | Do | Expect |
|---|---|---|
| 1 | Home → **Report** → library photo of a damaged road (or camera) + hold the mic for a Hindi note | "Checking your report…" → ~20–25 s → "Thanks, report added", AI found, "Muse Spark Open + Muse Spark 1.3: agree", +points |
| 2 | Tap the new pin → event page → **See photos** | Annotated photo with labels (Debris / Collapsed road, Road left …), Original toggle, faces/plates blurred |
| 3 | Home → search **Manali** → Directions | Verdict pill + agent headline (~20–30 s), disruption rows, purple **Unstable slope** banner, rain line |
| 4 | **Start** | Google Maps opens with Pathfinder's road |
| 5 | **Drive Watch** → add `&simulate=1` to the URL → Start Drive Watch | SIMULATED pill, spoken "… 5 kilometres ahead near Pandoh", later "Unstable slope ahead near Aut…"; English/हिन्दी toggle |
| 6 | Route → **Watch this trip** on, then post a report near NH-3 (step 1) | Bell badge → Alerts: "Your Mandi → Manali trip changed" |
| 7 | Report → **Slope** → hillside photo | "Thanks, slope photo added" → See the slope → level pill, signs, "Checked by 2 models"; risk appears ~30 s later |
| 8 | Kataula event → **Check if my vehicle can cross** → pick your car (or photo) | Verdict pill, width diagram, factors, advice EN/HI, "2 AI models agree"; Save my vehicle → route rows show "Your … : tight/won't fit" |
| 9 | `/official/login` → **Try as PWD Mandi (demo)** | Command Centre: stat tiles, Priority queue, AI Dispatch Plan, **Slopes to inspect** |
| 10 | Queue row Kataula → Field update → photo + 70% + one lane → Post | "AI check: … Consistent with 70%" → traveller's route shows "1 repair crew working" → repairs card 70% |

Note anything that looks wrong (screenshot + which step) and send it over.

## C. Verified from the cloud session on Oct 31 (live URL)

- Build live; manifest, service worker, offline page, icons, iOS splash, OG image (absolute URL) all 200; cron without secret → 401; demo login ✓.
- Report → 24.5 s, Spark Open wrote / Spark 1.3 verified, "2 AI models agree", annotated photo **labels render on Vercel** (bundled Inter).
- That report triggered **Road Watch** on 2 watched trips within ~10 s (event-driven).
- Route Check Mandi → Manali: Muse Wonder, 14 tool calls, 28 s, "Wait till 6:00 AM, go via NH-3".
- Vehicle fit (Swift @ Kataula): 12 s, won't fit (fully blocked), 2 models agree, Hindi ✓.
- Slope photo: 21 s, severe, 2 models; background risk agent → elevated (Muse Wonder).
- Field update (demo official, Kataula 70% one lane): 8 s, photo check "debris down ~75% · consistent", repairs card 70%.
- Not checkable from the cloud: real phone GPS, iOS speech/wake lock, PWA install — section A.
