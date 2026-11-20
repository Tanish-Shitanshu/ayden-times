# HANDOFF: Ayden (read fully, then guide the human step by step)

You are a fresh Claude Code session with zero context. The human is **Sai Mohit Kotta** (frontend; Windows laptop). His teammate is **Tanish Shitanshu** (backend, owns the Google Cloud project, billing and the AI Studio key). Team: **Ayden Times**. Event: Startup Buildathon India 2026, Delhi City Buildathon (Google DeepMind + Google Cloud). **Submission closes Sat 21 Nov 2026, 08:00 AM IST (treat as hard; verify on the dashboard).** Goal: rank 1.

Attached for context: `00_MASTER_PLAN.md` (product, rubric, claims guard). Read it first. Then `docs/plan/*` in the repo.

## Your working style
- Tell the human exactly what to do, one step at a time, with copy-paste commands. **Do everything you can yourself**; stop only for: logins, keys, billing, accepting terms, submitting. Say clearly "YOU do this now".
- Plain language. Honest stage: "MVP in progress". Never claim anything is live/built unless verified.
- **Commits: the human's git identity only, no Claude/co-author/attribution lines.** Never print, log or commit secrets (keys, connection strings). Never paste a key into chat.
- The human submits to the organisers and accepts any terms himself.

## What exists (already built and deployed by Tanish's Claude)
- **Repo (private):** https://github.com/Tanish-Shitanshu/ayden-times , branch `main` = backend + docs. Mohit pushes his UI on branch **`web`** (folder `apps/web`).
- **Monorepo:** `apps/api` (Fastify + TypeScript, engine, agents, 4 role packs), `packages/contract/src/index.ts` (API types, source of truth), `apps/web` (Mohit's React app, to be merged), `scripts/`, `docs/`.
- **API live (scripted mode, no model key yet):** https://ayden-app-388558128884.asia-south1.run.app (`/api/v1/health`, `/api/v1/system/status`). 32 automated tests pass. Smoke test: `BASE_URL=<url> node scripts/smoke.mjs`.
- **Google Cloud project `ayden-buildathon`, region `asia-south1`:** Cloud Run service `ayden-app`; Firestore (default) created; service account `ayden-run@ayden-buildathon.iam.gserviceaccount.com` (roles: datastore.user, secretmanager.secretAccessor, logging.logWriter, bigquery.dataEditor, bigquery.jobUser); Secret Manager secret `session-secret`; BigQuery dataset `ayden_analytics` table `mission_skill_results`.
- **Service env vars:** NODE_ENV=production, STORE=firestore, GOOGLE_CLOUD_PROJECT=ayden-buildathon, LLM_MODE=scripted, SANDBOX=gemini, SECRET_SOURCE=secret-manager, ANALYTICS=bigquery, MODEL_AGENT=gemini-4-hydrogen, MODEL_REASON=gemini-4-argon, MODEL_EMBED=gemini-embedding-2, MODEL_TESTER=gemini-4-hydrogen, CLOUD_RUN_REGION, COMMIT_SHA; secret SESSION_SECRET.
- **Product:** AI workplace rehearsal. Roles ready: software-engineer, banking-ops, nurse, tech-consulting. data-analyst = planned (non-clickable). Engine rule: **the model proposes, the engine decides** (validated tools, knowledge boundaries, visible Engine Trace). Scoring: code signals first, then a quote-bound judge (server verifies quotes), 2 runs, `uncertain` on disagreement. Learner code runs only in **Google's code-execution sandbox** (static labelled fallback). Privacy: learner owns report; cohort sees only groups of 5+; no leaderboards.
- Docs in repo: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/BUILT_VS_PLANNED.md`, `docs/INTEGRATION.md`, `docs/handoff/2_INTEGRATION_NOTES.md` (API behaviours, ids, event details; read it), `docs/plan/01_FRONTEND_BRIEF.md` (UI spec + 48-row QA matrix), `docs/plan/02_API_CONTRACT.md`.

## Steps (do in order)

**1. Orient (you).** Clone: `git clone https://github.com/Tanish-Shitanshu/ayden-times.git ayden` into a folder **outside iCloud-synced Desktop/Documents** (Tanish's Mac had git hangs there; Mohit on Windows: use e.g. `C:\dev\ayden`). Needs Node 22+. Run `npm install`, `npm test` (expect all pass), `npm run build`. **Human:** must have access to the repo (Tanish adds him as collaborator) and be logged in to GitHub (`gh auth login` or git credential).

**2. Merge the web app (you).** Ensure Mohit's code is on branch `web` under `apps/web` with `package.json` name `@ayden/web` and a `build` script that outputs `apps/web/dist`. Then `git checkout main && git merge origin/web`. Fix conflicts (folders are separate, conflicts should be rare). Requirements for `apps/web`: default `VITE_API_MODE=live`; API calls use relative `/api/v1/...` with `credentials:"include"`; `vite.config.ts` proxy as in `docs/INTEGRATION.md`; no secrets in the frontend; no `console.log`/TODO/placeholder text; every button works (QA matrix §12 in `docs/plan/01_FRONTEND_BRIEF.md`).

**3. Run everything locally (you).** `npm run build` (builds web then API), then `npm start` and open http://localhost:8080 : the API serves `apps/web/dist` at `/` (SPA fallback) and `/api/v1`. Run `BASE_URL=http://localhost:8080 npm run smoke`. Windows: `scripts/*.sh` need Git Bash or WSL; `.mjs` scripts run with plain node.

**4. Integration QA (you + human on a phone).** Walk the demo path for each ready role: landing, `/demo`, consent, onboarding, mission, report, progress, drill, New variant, privacy centre, how-it-works, cohort. Fix UI bugs in `apps/web`. If the API misbehaves (wrong event, missing field, error), capture request + response + mission id and **send to Tanish** (his Claude fixes the backend); do not edit `packages/contract` without telling him. Known behaviours (details in `2_INTEGRATION_NOTES.md`): `pending` is always false; `check_result` can take ~25 s in live mode; `call` channel for the banking customer; nurse record `it_bed` changes mid-mission (`delta.changedItems`); hidden checks are named "Hidden check N"; show a banner when `runtime.mode !== "live"`.

**5. Google Cloud deploy (human logs in, you run commands).**
- **Human:** install Google Cloud CLI, run `gcloud auth login` with an account that has access to project `ayden-buildathon` (**Tanish must add Mohit** in Google Cloud Console, IAM: roles Cloud Run Admin, Cloud Build Editor, Service Account User, Storage Admin, Artifact Registry Writer; or simply let **Tanish run the deploy**, which is simplest). Then `gcloud config set project ayden-buildathon`.
- **You:** from the repo root (after step 3 passes):
```
gcloud run deploy ayden-app --source . --region asia-south1 --project ayden-buildathon --update-env-vars COMMIT_SHA=<short-git-sha> --quiet
```
Settings persist from earlier deploys (service account, secrets, env vars, min-instances 1). The `Dockerfile` builds web + API. Takes ~4 min. Then `BASE_URL=https://ayden-app-388558128884.asia-south1.run.app node scripts/smoke.mjs` and open the URL on a phone over mobile data. Do **not** delete the service or change its URL; it must stay live through evaluation and the regional showcases (Nov 23, 25, 27; finale Dec 2).

**6. Live Gemini mode (Tanish only: needs his AI Studio key).** **Tanish** runs `bash scripts/enable-live.sh` in his terminal and pastes the key when asked (it stores it in Secret Manager, verifies every Gemini call with `scripts/smoke-gemini.mjs`, switches Cloud Run to `LLM_MODE=live`, runs the smoke test). **Nobody pastes the key into chat.** The real Gemini calls have **not been tested yet**: if `smoke-gemini.mjs` fails, fix `apps/api/src/agents/llm.ts` (function-call step parsing, code-execution result steps, embeddings shape) by reading the live docs as Markdown: `https://aistudio.google.com/docs/<page>.md` (pages: get-started, structured-output, function-calling, code-execution, embeddings), then redeploy (step 5) and re-run the smoke tests. Models (verified on Google's page 20 Nov): `gemini-4-hydrogen` (colleagues, code execution), `gemini-4-argon` (judge/weaver), `gemini-embedding-2`. Free-tier rate limits are the main risk with ~20 testers: the code has a circuit breaker that falls back to scripted mode (flagged in the UI).

**7. Antigravity on screen (human).** Mohit does at least one real task in the Antigravity IDE (e.g. role-pack review or UI polish; skills are in `.agents/skills/`) on a **personal Gmail** account (the SNU Workspace account gets no Antigravity plan), screen-records it. Afterwards set `ANTIGRAVITY_USED=1` on the service so `/system/status` shows it: `gcloud run services update ayden-app --region asia-south1 --project ayden-buildathon --update-env-vars ANTIGRAVITY_USED=1`. Only do this if it really happened.

**8. Real users (humans).** Share the Cloud Run link with students; create a cohort in the app (`/cohort`) and have testers join with the code; with 5+ consenting finishers the cohort view shows live anonymous patterns. Quote only measured numbers from `/api/v1/system/status` counters. Collect two tester quotes (with permission). No leaderboards.

**9. Freeze and submit (humans).** Feature freeze ~05:30 AM. Then: phone test on mobile data, secrets scan (`git log -p | grep -iE "AIza|api[_-]?key|secret|postgres://"` must be empty), tag a release. Deck (PDF < 10 MB; outline in `docs/plan/05_DEMO_DECK_GTM.md`), demo video up to 3 min (Google Drive public link or YouTube), prototype link = the Cloud Run URL. **A human submits on the Hack2skill dashboard before the deadline** (one submission per team). Rotate the old Neon DB password only after evaluation.

## Claims guard (the judges have the team's earlier form)
Say: "MVP in progress; built at the event"; "scores are formative with quoted evidence"; "learner code runs in Google's sandbox"; nurse/bank scenarios are simplified, fictional and not reviewed by a clinician/compliance professional. Do not say: validated, launched, live users (unless counters show them), ADK/Agent Runtime/Live/Lyria/Nano Banana/SDP (not built), Hindi reviewed by native editors, Gym API/calibrated scores (roadmap only).

## Known gotchas
- If `npm install` produces odd type or module errors, delete `node_modules` and run `npm install` again once (never run two installs at once).
- Use `git push` with your normal GitHub login. On Tanish's Mac the keychain helper hung; irrelevant on Windows.
- API errors use `{error:{code,message}}`; see `packages/contract/src/index.ts`.
- Open decisions for Tanish: Data Analyst role (planned only), Sensitive Data Protection, Google sign-in (not built).
