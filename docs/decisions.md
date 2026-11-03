# Decisions log

Small decisions agreed in chat, newest first. Bigger designs get their own file in `docs/` (linked here).

| Date | Decision | Where |
|---|---|---|
| 2026-11-01 | Recovery pass over old work: only one branch held files `main` never got — the Oct 31 Phase 7 drafts (`claude/determined-fermat-ui5oyr`, PR not merged). Dhruv: Phase 7 docs are NOT pushed to GitHub/main (read in Claude only), so they were not copied; they predate Nov 1 and need a refresh | Phase Tracker row 7 |
| 2026-11-01 | Multi-user sync: optimistic locking on `events.rev` + `event_votes` (one vote per phone per spot per 6 h, atomic) via migration 0005; data version also watches the timeline | `docs/event-lifecycle.md` |
| 2026-11-01 | Passing traffic thresholds: closed + ≥10 km/h or jam/accident + ≥30 km/h = full "gone"; one lane/slow + ≥30 km/h = half; real GPS only. Investigator moves an event to Unconfirmed only when it cited news | `docs/event-lifecycle.md` |
| 2026-11-01 | "Still there?" alerts go to opted-in Scouts only and share their 2-a-day budget; Drive Watch asks only about spots passed since Drive Watch started; taps are stored in `events.sources.taps` (no schema change) | `docs/event-lifecycle.md` |
| 2026-11-01 | Events with a crew assigned are never auto-closed (stay Unconfirmed); real reports still merge into demo events; road damage shelf life kept at 5 d / 7 d | `docs/event-lifecycle.md` |
| 2026-11-01 | Event lifecycle designed: shelf life per type, Unconfirmed at half life, auto-close, pothole sizes, "Still there?" taps (≤20 km/h, multiple choice), passing traffic, Investigator news → Unconfirmed | `docs/event-lifecycle.md` |
| 2026-11-01 | "Still there?" may be shown up to 20 km/h; Scout photo requests stay at ≤10 km/h | `docs/event-lifecycle.md` |
| 2026-11-01 | Every chat decision is written to the repo in the same turn (rule 11 in SEQUENCE.md) | `SEQUENCE.md` |
| 2026-11-01 | `pnpm demo-reset` run after Dhruv's crew-loop testing (Kataula closed + unstaffed for judges) | Phase Tracker |
| 2026-11-02 | B1 fix "Pick a spot": when GPS is off or outside Himachal, /report lets you pick a demo spot (Mandi new pin · Pandoh · Aut · Kataula · Jhiri) or drop a pin on our road layer. Same AI pipeline; report/photo/claims/new event are `is_demo`, event `sources.placed=true` → expires like a real one, only merges into demo events, no points, no scout bonus, no voice "mentions" on real events; server refuses a placed spot with no road within 1 km (422). "Still there?" for judges not done (option not chosen) | `docs/test-log.md` B1 |
| 2026-11-02 | B2: alert titles say "Your trip to X" when the trip starts at "Your location". B3: Hindi summaries are checked in code (≥5 Devanagari letters) and re-translated by a small Meta Spark job when a model wrote Latin-script Hindi; empty (hidden) if that fails | `docs/test-log.md` B2, B3 |
| 2026-11-02 | Manual testing finished: F1 passed with guide, F2–F7 tested by Dhruv himself; B1–B3 fixed (#27, #28); `pnpm demo-reset` run at the end | `docs/test-log.md` |
| 2026-11-03 | B4 anti-fake (small fix): library photos need a camera date to count (no last-modified fallback); verifier flags downloaded/forwarded photos (verify-v4 `looksDownloaded`); such uploads → pending, no pin, 0 points; map-placed demo reports exempt; no "flag as fake" button / reverse image search (time) | `docs/test-log.md` B4 |
- 2026-11-03 · README rewritten for US judges (context glossary, problem → loop → vs Google Maps → features with 12 live screenshots in docs/screenshots/ → Meta model map → build timeline). Live URL is pathfinder1-ten.vercel.app (the repo About link pathfinder-navy-one gives 404).
