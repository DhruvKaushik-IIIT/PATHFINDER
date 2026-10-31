# Recording + editing the demo video

Script: [`demo-script.md`](demo-script.md). Target: **≤ 3:00**, 1080p, phone screen in portrait centred on a 16:9 canvas.

## 1. Capture (phone)

- **iPhone:** Settings → Control Centre → add *Screen Recording*. Long-press the record button → **Microphone ON** only for Scene 2 (the Hindi note), OFF for the rest (no notification sounds, no breathing).
- **Android:** quick settings → *Screen record* → "Record audio: Microphone" for Scene 2 only.
- Do Not Disturb ON, brightness max, battery icon > 50 %, time on the status bar looks like daytime (re-record if it says 3 AM).
- Use the **installed app** (home-screen icon) so there are no browser bars.
- Record **one clip per scene** — a bad take only costs that scene. Start each clip 2 s before the first tap and stop 2 s after.
- Drive Watch voice: ringer on, volume ~70 %. The spoken alert comes through the screen recording's internal audio on iPhone.
- The Command Centre scene: sign in with **Try as PWD Mandi (demo)** on the phone too (phone layout is the reference).

## 2. Voiceover (laptop)

- Record after the screen clips, in a quiet room, phone or laptop mic 15 cm away, read the script once per scene.
- Free tools: QuickTime (File → New Audio Recording) or Audacity. Export WAV/M4A.
- Pace ~145 words/min. If a scene's voiceover runs longer than its clip, cut words, don't speed up the voice.

## 3. Edit

Any editor works: **CapCut** (free, easiest captions), iMovie, DaVinci Resolve.

1. Canvas 1920×1080, dark-grey or blurred-map background, phone clip centred (~70 % height). Optional rounded phone frame.
2. Drop clips in scene order, then the voiceover track; trim clips to the voice.
3. **Speed up waits** (AI checking steps, agent thinking) 3–4×, and add a small caption "sped up 4×" — honest and judges like it.
4. Captions: the *italic* lines from the script, bottom-left, white text on a dark-glass pill, 2–3 s each. The model-name captions are the most important ones (Stage 1 = "uses Meta models").
5. Subtitles for the voiceover (CapCut → Auto captions → English). Hindi lines (voice note, Hindi banner) get an English subtitle.
6. Music: optional, very quiet (−25 dB) royalty-free track; none under the Hindi note or the Drive Watch voice.
7. End card (script Scene 7) for 4–5 s.
8. Export 1080p, H.264, 30 fps. Check the length is **≤ 3:00** — judges may stop watching after that.

## 4. Upload

- **YouTube** → Unlisted (or Public for Community Vote / Most Viral) — title "Pathfinder — AI-verified road conditions for Himachal | Meta AI Hackathon".
- Description: paste the short description from [`submission.md`](submission.md) + live URL + repo URL.
- Open the link in a private window to confirm it plays without sign-in.
- For **Most Viral:** cut a 30–45 s vertical version (Scene 2 + Scene 4 voice alert + end card) for Instagram Reels / X / LinkedIn, tag Meta + Cerebral Valley, link the live app.

## 5. Final check on the video

- [ ] Every Meta model is named on screen at least once (Spark Open, Spark 1.3, Wonder, SAM 3.1, Voice, Image — Image appears if you show the Share alert card; otherwise list it on the end card).
- [ ] Only hackathon-built features shown; nothing fake. Simulated drive is labelled "simulated".
- [ ] No keys, emails, dashboards (Meta / Baseten / Supabase / Vercel) visible in any frame.
- [ ] No faces or number plates of strangers unblurred (Pathfinder blurs them — check the library photo you used).
- [ ] ≤ 3:00, sound levels even, captions readable on a phone.
