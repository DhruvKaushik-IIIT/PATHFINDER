# Final submission checklist

Deadline: **Nov 4, 9:00 PM ET = Thu Nov 5, 7:30 AM IST**. Plan: submit **Wed Nov 4 night IST**.

## Checked from the cloud session (Oct 31)

- [x] `pnpm scan-secrets` → **clean** (tracked files + full history of all branches; only `.env.example` with names, no values).
- [x] `tsc --noEmit` 0 errors · `pnpm build` ✓ · offline tests pass: `test:fit`, `test:slope`, `test:drive`, `test:reopening`.
- [x] Live URL https://pathfinder1-ten.vercel.app: `/`, `/official/login`, `/manifest.webmanifest`, `/offline.html`, `/api/health` (mode live, budget not over) → 200; OG image tag points to an absolute URL.
- [x] Repo URL https://github.com/DhruvKaushik-IIIT/PATHFINDER answers 200.
- [x] README lists the six Meta models and what each does; MIT `LICENSE` with the hackathon note.
- [x] Demo docs: [`demo-script.md`](demo-script.md), [`recording-guide.md`](recording-guide.md), [`submission.md`](submission.md), [`smoke-test.md`](smoke-test.md).

## You (Dhruv) — before submitting

1. [ ] Open the repo in a **private / logged-out window** → it must load (= public). If not: GitHub → Settings → General → Danger Zone → Change visibility → Public.
2. [ ] Merge the Phase 7 PR into `main` (squash) so the README and docs on the default branch are final.
3. [ ] Meta dashboard (dev.meta.ai → Billing): note remaining credit. Baseten: credits OK. If close to empty, lower `AI_DAILY_CAP_USD` in Vercel so judges never hit a billing error (the app falls back to code answers anyway).
4. [ ] `pnpm demo-reset` (+ `pnpm seed-slopes` if slope sites are missing) on the evening of Nov 4, so seed times look fresh when judges open the app.
5. [ ] Record + edit the video ([`recording-guide.md`](recording-guide.md)), ≤ 3:00, upload (YouTube unlisted or public), check it plays logged-out.
6. [ ] Paste the YouTube link into `docs/submission.md` and README (optional), commit.
7. [ ] Fill the submission form from [`submission.md`](submission.md): name, tagline, description, links (live, repo, video), Indie track, bonus prizes (Best Agentic Use-Case, Best Build on Meta Open-Weight Models, Community Vote, Most Viral), Meta models used.
8. [ ] Smoke-test the live link once more on your phone (section B of [`smoke-test.md`](smoke-test.md), steps 1, 3, 9 at least).
9. [ ] Submit. Screenshot the confirmation page.

## After submitting (optional)

- [ ] Post the 30–45 s vertical cut for Community Vote / Most Viral with the live link.
- [ ] Don't push breaking changes until judging is over; if you must, test on a Vercel preview first.
