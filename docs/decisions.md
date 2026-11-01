# Decisions log

Small decisions agreed in chat, newest first. Bigger designs get their own file in `docs/` (linked here).

| Date | Decision | Where |
|---|---|---|
| 2026-11-01 | Events with a crew assigned are never auto-closed (stay Unconfirmed); real reports still merge into demo events; road damage shelf life kept at 5 d / 7 d | `docs/event-lifecycle.md` |
| 2026-11-01 | Event lifecycle designed: shelf life per type, Unconfirmed at half life, auto-close, pothole sizes, "Still there?" taps (≤20 km/h, multiple choice), passing traffic, Investigator news → Unconfirmed | `docs/event-lifecycle.md` |
| 2026-11-01 | "Still there?" may be shown up to 20 km/h; Scout photo requests stay at ≤10 km/h | `docs/event-lifecycle.md` |
| 2026-11-01 | Every chat decision is written to the repo in the same turn (rule 11 in CLAUDE.md) | `CLAUDE.md` |
| 2026-11-01 | `pnpm demo-reset` run after Dhruv's crew-loop testing (Kataula closed + unstaffed for judges) | Phase Tracker |
