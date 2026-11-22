# Ayden: progress report (21 Nov 2026)

Read this first so nobody repeats work that is already done. Everything below was checked in the session that wrote it; items marked **NOT VERIFIED** were not.

## 1. Where things are

| Thing | Location |
|---|---|
| Repo | https://github.com/Tanish-Shitanshu/ayden-times, `main` is the source of truth (web + API merged). `web` branch is the same history. |
| Live app (web + API, one origin) | https://ayden-app-388558128884.asia-south1.run.app |
| Status endpoint | `/api/v1/system/status` |
| Cloud project / service / region | `ayden-buildathon` / `ayden-app` / `asia-south1` |
| Local copy (Mohit's laptop) | `C:\Users\Mohit\Desktop\Buildathon\ayden` |

## 2. What was done in this session

1. Pulled the backend, merged the frontend (`apps/web`, package `@ayden/web`) into the monorepo. `apps/web/src/contract.ts` was byte-identical to `packages/contract`, so no contract change.
2. Removed the nested `apps/web/package-lock.json` (the root lock governs the workspace).
3. Fixed Windows issues: `scripts/build-web.mjs` spawn (`shell` on win32), local Python sandbox uses `python` on Windows, shell scripts forced to LF via `.gitattributes` (`bash scripts/enable-live.sh` failed on CRLF before this).
4. Backend change: the engine now emits a `beat` event ("Beat N of M · title") when the learner advances. The UI draws a beat divider from it; the backend never sent one before.
5. Local full stack verified: `npm run build`, 32/32 API tests, local smoke test, deep links (`/roles`, `/mission/x`) serve the SPA, `/api/v1/*` unchanged, unknown `/api/*` returns JSON 404.
6. Fixed three bugs in the never-run `apps/web/qa/qa-live.cjs` (wrong "aria-disabled" test, `canAdvance` ignoring the tab, and the file-fix step). Added `apps/web/qa/gold.cjs` (the correct code fix per variant, used by the QA so real sandbox checks can pass).
7. Deployed to Cloud Run from source (revision `ayden-app-00007`, then `00008` for the new key, `00009` for the tester model). `/` now serves the web app.
8. Docs added: `docs/INTEGRATION_NOTES.md`, live link in `README.md`, this report.
9. All commits are authored `Sai Mohit Kotta <kottasaimohit@gmail.com>` with no AI attribution (checked with a grep of the history). For GitHub to link them to the `Mohitlikestocode` profile, that email must be added under GitHub Settings > Emails (Mohit did this).

## 3. Models and API key (what failed, what works)

Only one API key is needed: a free Gemini key from Google AI Studio. Everything else uses the Cloud Run service account.

- Default Gemini 4 models (`gemini-4-hydrogen`, `gemini-4-argon`) hung or hit quota on a free key. Do not retry them.
- `gemini-2.5-*` is closed to new users. `gemini-3.5-flash`, `3.7-flash` returned "high demand" (503). `gemini-3.6-flash`, `3.8-flash` timed out. `gemini-3.1-pro-preview` hit quota.
- **These work on the free key** (smoke test, all six checks pass):
  - `gemini-3.5-flash-lite` for colleague agents (function calling) (~4 s)
  - `gemini-3.1-flash-lite` for judge and weaver (structured output) and as code-execution tester (~2-8 s)
  - `gemini-embedding-2` for embeddings (3072 dims)
- Cloud Run env now: `LLM_MODE=live`, `MODEL_AGENT=gemini-3.5-flash-lite`, `MODEL_REASON=gemini-3.1-flash-lite`, `MODEL_TESTER=gemini-3.1-flash-lite`.
- The key lives only in Secret Manager secret `gemini-api-key` (version 2 = Mohit's free key). The local copy is in `apps/api/.env.local` (git-ignored). A secret change needs a new revision to take effect (`gcloud run services update ... --update-env-vars X=Y`).
- A 402 "prepayment credits depleted" on a free key means the key's project has prepaid billing with no balance. Use a key from a project without billing.
- **Rate limits are the main demo risk.** Heavy testing (the QA matrix) pushed the live service into scripted fallback (the circuit breaker opens for about a minute after repeated failures). Do not run big tests right before the demo.

**Incident, 21 Nov:** the live service silently went to `LLM_MODE=scripted` (revision `00010`, not deployed by the author of this report) and showed scripted replies while the key was fine. It was set back to `live` (revision `00011`). If you change service env vars, check `/api/v1/system/status` says `"runtime":"live"` afterwards, and do not set `LLM_MODE=scripted` before the demo.

## 4. Test and QA results

| Check | Result |
|---|---|
| API tests | 32/32 pass (local) |
| Local smoke test (scripted) | Pass |
| Local smoke test (live Gemini) | Pass: judge `gemini-3.1-flash-lite`, 6 quotes verified, ~77 s for a full mission |
| Live URL smoke test | Pass: mode live, judge `gemini-3.1-flash-lite`, 6 quotes verified |
| Run checks in Google's sandbox | Pass locally: "Ran checks in a Google-hosted sandbox" in 8 s (`3.1-flash-lite`) and 13 s (`3.5-flash-lite`). A 25 s timeout with the slower tester caused static fallback earlier, hence the tester change. |
| Full mission replay through the live API (fix saved, all beats, finish) | Pass: report ready |
| Local UI QA matrix (360 px, scripted) | All rows pass except banking call row (script limitation, see below) |
| Live UI QA matrix (360 px) | Rows 1-30 pass. **Row 31 onward fail in the automated UI run** (reaching the final Finish in the UI), and 32-39 cascade from it. The same path works through the API, so this is **NOT VERIFIED** as app-bug or script-bug. Needs a manual run (see section 6). Rows 40-48 (groups, privacy, export, how-it-works, 404, delete, 360 px) pass. |
| Banking call channel in the UI | **NOT VERIFIED.** Backend test covers the `call` event; the QA driver cannot reach it. |
| axe, gutter checks on the live URL | **NOT RUN** (scripts still point at `127.0.0.1:4173`) |
| Real phone on mobile data | **NOT DONE** (needs a person) |

## 5. Google services (honest list for the deck and Q&A)

**Used and verified**
- Gemini API: function calling (colleagues), structured output (judge, scenario weaver), embeddings (`gemini-embedding-2`).
- Gemini code execution tool: learner code runs in Google's sandbox (verified on real missions). Falls back to labelled static checks if the sandbox is slow or unavailable.
- Google AI Studio: API key.
- Cloud Run: hosts API and web app.
- Cloud Build and Artifact Registry: used by `gcloud run deploy --source .`.
- Firestore: sessions, events, reports. Status shows `live`.
- Secret Manager: Gemini key and session secret. Status shows `live`.
- Cloud Logging: structured logs. Status shows `live`.
- Agent Skills files: `.agents/skills/ayden-engineering-standards` and `.agents/skills/ayden-role-pack` exist in the repo.

**Do NOT claim**
- ADK / Agent Runtime: not used, no dependency in `apps/api`.
- Antigravity: status shows `planned`. Only true if Mohit really did a task in it and Tanish sets `ANTIGRAVITY_USED=1`.
- BigQuery: status shows `planned`. Tanish set analytics env vars; no rows were seen by us. Verify before claiming.
- Sensitive Data Protection, Gemini Live voice, image generation, Gym API: not built.
- Embeddings: smoke test passes; confirm they drive drill choice on the live site before saying so.

## 6. Open items (do these, in order)

1. **Check the live service is in live mode** before the demo: `GET /api/v1/system/status` must say `"runtime":"live"` and "Gemini API = live". If it says scripted, wait a minute (circuit breaker) and retry; do not run load.
2. **One manual full mission** on a phone, over mobile data, on the SWE demo path: Landing, Try the demo, consent, chat, open ticket/guide/file, Continue, fix `src/pricing.py` (apply discount once, `ValueError` on bad input), Run checks, Continue, commit and PR, review card, Continue, reply to Arjun, Priya, Meera, Finish, report. This settles QA row 31+.
3. Banking: confirm the Call tag and call-channel replies in a banking mission.
4. Run `axe` and `gutters` against the live URL (edit the hard-coded base URL) and record results in `docs/QA_LIVE.md`.
5. Tag `v0.2.0` after steps 2-4.
6. Optional: BigQuery rows, `ANTIGRAVITY_USED=1` only if true, deck screenshots at 2x from the live URL.

## 7. Behaviour to know (do not "fix" by accident)

- Light theme only; Data Analyst stays `planned` (non-clickable); no leaderboards; honesty labels stay ("MVP in progress", "scripted", "Planned", "Formative feedback, not a hiring score").
- `pending` is always false; replies arrive in the act response. Run checks can take up to ~25 s.
- Drill sessions return the parent mission id as `missionId` (client remembers the drill id).
- Attempts are capped at 2 per variant (409 `attempt_cap`); 10 mission creations per hour per session (429).
- Starter code fails 4 of 7 checks in the real sandbox, so the mission will not advance past beat 2 until the learner fixes it. That is correct, not a bug.

## 8. Deploy command

```bash
gcloud run deploy ayden-app --source . --region asia-south1 --project ayden-buildathon \
  --update-env-vars LLM_MODE=live,MODEL_AGENT=gemini-3.5-flash-lite,MODEL_REASON=gemini-3.1-flash-lite,MODEL_TESTER=gemini-3.1-flash-lite,COMMIT_SHA=$(git rev-parse --short HEAD) --quiet
```

On Windows PowerShell use `gcloud.cmd` (the `.ps1` is blocked by the execution policy). Required IAM for the deploying user: Cloud Run Admin, Cloud Build Editor, Service Account User, Storage Admin, Artifact Registry Writer, Service Usage Consumer, and Secret Manager Admin to change the key.

## 9. 22 Nov update (investor round prep)

Read this before touching the same files. Everything below is committed on `main`.

- **New role `executive`** (Startup CEO, decision-making): `apps/api/src/roles/executive.ts`. `RoleId` gains `"executive"` in both contract copies (logged in `CONTRACT_CHANGES.md`). End-to-end test: `apps/api/test/executive.e2e.test.ts`.
- **Feedback and traction**: `POST /api/v1/feedback` (needs a session) and public `GET /api/v1/traction` (aggregates and consented testimonials only). Store gained `putFeedback` and `listFeedback` in both backends; deleting a user deletes their feedback. Web: `/feedback`, `/traction`, a form on the report page, a landing strip that only appears at 5 or more responses.
- **Measured AI cost**: counters `tokens`, `costMicros` and `measuredMissions` (flushed from memory every 15 s so counting cannot slow or fail a request). Shown on `/traction`.
- **Key failover**: `apps/api/src/infra/keyring.ts`. `config.geminiKey` is now a getter. Add `GEMINI_API_KEY_BACKUP` (Secret Manager secret plus `--update-secrets`) to use it. No backup is connected yet; the one tried returned 402 (no credits).
- **Sandbox**: the runner retries when the model garbles the base64 payload (`isTransportFailure`).
- **Report**: key moments now show one entry per message with the fullest quote.
- **Sounds**: `apps/web/src/lib/sound.ts`, hooked into the celebration card and beat advance.
- **Renamed** the consulting role title to "Consulting Analyst (Business Strategy)" because the scenario is a retail margin review. The role id `tech-consulting` is unchanged.
- Docs: `docs/FOUNDER_BRIEF.md`, `docs/UNIT_ECONOMICS.md`, `docs/URL_AND_MEDIA.md`.

**One thing to decide (Tanish owns billing):** Google's free Gemini tier may use content to improve its products; the paid tier does not. Turn billing on before real students use it at scale. Cost stays in cents per learner.
