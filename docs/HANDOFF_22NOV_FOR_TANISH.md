# Handoff for Tanish (and his Claude): 22 Nov 2026

**Read this first, then `git pull`.** It lists what Mohit asked for, what is already done (so nobody repeats it), what is still open, and what is yours. Live site: https://ayden-app-388558128884.asia-south1.run.app (revision `ayden-app-00025-rg2`, commit `51c16d7`, status `"runtime":"live"`).

## 0. Context

Ayden qualified for the **details round, in front of real investors, on 23 Nov**. The product is to be finished by about **4 pm on 22 Nov**. After that, Mohit runs about **50 testers** through a 5-minute rehearsal and a feedback form, and presents a live traction dashboard. Last time an investor asked "why BigQuery if it is costly?", and the team could not explain architecture choices. Pitch feedback was: too dramatic, off the point, teammates topping up each other imprecisely. Everyone must be able to explain the product and the costs in short, exact sentences.

## 1. What Mohit asked for, and where each item stands

| # | Mohit's request | Status |
|---|---|---|
| 1 | Add a sixth role: an administrative, **CEO decision-making** simulation (decisions for people, company, investors) | **Done.** Role id `executive`, "Startup CEO (Decision-Making)". See section 2. |
| 2 | Check all six simulations are actually **relevant**, not only the Software Engineer one | **Done to the extent possible.** Read the code of Banking, Nurse, Consulting; played all four non-code roles and the new one through the live API; audited in `docs/FOUNDER_BRIEF.md` section 5. Not done: a full UI click-through of every role; Banking's `call` channel has not been checked in the UI. Nurse and Banking are still **not reviewed by a clinician or compliance professional** (labelled so in the product). |
| 3 | Can the Cloud Run URL change? Would it need a domain? | **Answered, nothing changed.** The `run.app` address cannot be renamed; the submitted URL stays. Options (short link and QR, Firebase Hosting, custom domain, load balancer) are in `docs/URL_AND_MEDIA.md`. **Caveat:** Firebase Hosting forwards to Cloud Run with a ~60 s limit; our finish-and-score step can approach it. |
| 4 | Which cloud services can we maximise? | **Answered, nothing new wired.** Candidates, only to be claimed once built: Looker Studio on BigQuery (free dashboard), Google sign-in (free at our size), Gemini Live voice for verbal SBAR (has a free tier, bigger build). |
| 5 | More detail on the other roles so everything is relevant | **Done** in `docs/FOUNDER_BRIEF.md` section 5 (real job, what it tests, strengths, honest limits). |
| 6 | **Feasibility and cost**: "every hour of usage costs X, we could sell for Y". Avoid the BigQuery-style trap | **Done.** `docs/UNIT_ECONOMICS.md` plus a **measured** cost on `/traction`. BigQuery answer (free tier, a few hundred bytes per mission, off the critical path) is in `docs/FOUNDER_BRIEF.md` section 4. |
| 7 | **Traction**: show it on the website and in the pitch | **Done.** Feedback form, public `/traction`, landing strip (appears at 5 or more responses). QR codes in `docs/images/`. See section 3. |
| 8 | Which Google tool does **music** (Lyria)? Veo? Free or cheap version? | **Researched.** Lyria is music, Veo is video. No free API tier for either; Mohit's **AI Pro plan** includes Flow and music credits in the apps. Prompts are in `docs/URL_AND_MEDIA.md`. The Lyria sound file has **not** been generated (Mohit does that in the Gemini app). |
| 9 | A **completion sound** like Duolingo, ideally from Lyria | **Built** with a browser-synthesised chime; a Lyria file dropped in `apps/web/public/sounds/` overrides it. |
| 10 | Founders must understand the architecture and technical decisions | **Done.** `docs/FOUNDER_BRIEF.md` (decisions table, hard Q&A). **Tanish: please read sections 3 and 4.** |
| 11 | Review the website as a reviewer, fix errors, mobile friendly | **Partly done.** New pages checked at 360 px with **zero WCAG A/AA axe violations** and no horizontal scroll. Found and fixed: Neel calling the learner "Anika", awkward opening wording, the misleading "Tech Consulting" title. |
| 12 | Pitch coaching | **Guidance written** (`docs/FOUNDER_BRIEF.md` section 6). The actual pitch script is still to do; Mohit said to do it later. |

## 2. What is built (all on `main` and deployed)

- **Executive role:** `apps/api/src/roles/executive.ts`. Scenario: hire three engineers (runway maths per variant), a security incident, an investor who asks to hide it, a customer wanting a Friday date, an honest board update. 5 skills, 5 drills, 3 variants, consequences (hiding it, overpromising, blaming). `RoleId` gains `"executive"` in both contract copies (`CONTRACT_CHANGES.md`). Tests: `apps/api/test/executive.e2e.test.ts`. A live run in production scored 22 of 22 with 16 quotes verified.
- **Feedback and traction:** `POST /api/v1/feedback` (needs a session), public `GET /api/v1/traction` (aggregates; a tester shows only if they ticked "show publicly"; name, college and photo are dropped otherwise). New store methods `putFeedback` and `listFeedback` in both stores; deleting a user deletes their feedback. Web: `/feedback`, `/traction`, a form on the report page, and `TractionStrip` on the landing page. Summary logic: `apps/api/src/domain/traction.ts`.
- **Measured AI cost:** counters `tokens`, `costMicros`, `measuredMissions`, accumulated in memory and flushed every 15 s so they can never slow or fail a request. Priced at published paid-tier rates in `apps/api/src/agents/llm.ts`. Shown on `/traction`.
- **Key failover:** `apps/api/src/infra/keyring.ts`. `config.geminiKey` is a getter. Reads `GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `GEMINI_API_KEY_BACKUP_2`. Switches on quota or key errors; parks the failing key 90 s (quota) or 1 h (auth). **No backup is connected yet.**
- **Sandbox hardening:** the runner retries when the model garbles the base64 payload (`isTransportFailure`).
- **Report fix:** key moments now one per message, fullest quote kept.
- **Sounds:** `apps/web/src/lib/sound.ts`, on the celebration card and beat advance; footer on/off switch.
- **Rename:** the consulting role title is now "Consulting Analyst (Business Strategy)". The id `tech-consulting` is unchanged.
- **Earlier today:** illustrated README, tidier landing hero, a 64-second demo video (kept outside the repo), the new Gemini key (Secret Manager `gemini-api-key` version 3).

Commits (newest first): `51c16d7`, `e348a91`, `e88f1c2`, `0ee0374`, `23b71e0`, `4719ac6`, `dd4ed33`, `d2d3cdd`, `a1a9915`, `1d3969d`, `db06926`.

**Verification state:** 58 automated tests pass; type-checks clean; secret scan clean; every commit authored `Sai Mohit Kotta` with no AI attribution.

## 3. Traction campaign (Mohit's side, for awareness)

Testers do one 5-minute rehearsal, then the feedback form on the report page (or `/feedback`). `/traction` updates live. **Do not edit or seed numbers.** "Missions completed, all time" includes our own testing and is labelled so. The cost-per-mission panel appears after about 3 completed missions since this deploy.

## 4. What is open, and who

**For Tanish (backend and cloud owner):**
1. **Turn on paid Gemini terms.** On the free tier Google may use content to improve its products; the paid tier does not. Mohit's AI Pro plan gives **$10 a month of API credits**, claimed in AI Studio with a **$5 prepayment** and a spend cap (suggest about $15). Choose the project that owns the key on the live site, so nothing else changes. If a new key is made, put it in `apps/api/.env.local` and tell Mohit; it then goes into Secret Manager as a new version of `gemini-api-key`.
2. **Backup key.** The one Mohit tried returned `402 prepayment credits are depleted` (a prepay project with no balance). Either top up that project or supply another. Then wire it:
   - `gcloud secrets create gemini-api-key-backup --project ayden-buildathon`, add the version from stdin, then
   - `gcloud run services update ayden-app --region asia-south1 --project ayden-buildathon --update-secrets GEMINI_API_KEY_BACKUP=gemini-api-key-backup:latest`
   - then check `/api/v1/system/status` still says `"runtime":"live"`.
3. **Review `executive.ts`** the way you reviewed the others, and look at `feedback` and `traction` in Firestore (collection `feedback`, ordered by `createdAt`).
4. **Model lifecycle:** one pricing summary lists an end date in 2027 for `gemini-3.1-flash-lite`. Check Google's deprecations page and plan the move to a newer Flash-Lite, then re-measure cost.
5. **Do not set `LLM_MODE=scripted` on the live service** before or during the pitch. Check `/api/v1/system/status` just before presenting.

**For Mohit:** run the testing campaign; generate the Lyria sound (prompts in `docs/URL_AND_MEDIA.md`) and hand over the file; decide the short link and QR; the pitch script.

**Unassigned, only if time allows:** a full UI click-through of every role on a phone; Banking `call` channel in the UI; Looker Studio on BigQuery; Gemini Live voice.

## 5. Rules that still apply

- Commits authored `Sai Mohit Kotta <kottasaimohit@gmail.com>` for Mohit's work; **no Claude or AI attribution** in commits or PR text. Check with `git log --format=%B | grep -i claude` (must print nothing).
- Never print, log or commit a key. `.env*` stays git-ignored.
- Contract is frozen at v1.0. Any change goes in `CONTRACT_CHANGES.md` and in both contract copies.
- Claims guard: do not claim ADK, Antigravity, Gemini Live, BigQuery rows we cannot show, validated scores, or users we cannot show on `/traction`.
- Keep the honesty labels ("MVP in progress", "Formative feedback, not a hiring score", "Training scenario, not clinical advice").

## 6. How to check the state yourself

```bash
git pull
npm install
npm test                    # expect 58 passing
npm run build
BASE_URL=https://ayden-app-388558128884.asia-south1.run.app node scripts/smoke.mjs
curl -s https://ayden-app-388558128884.asia-south1.run.app/api/v1/system/status
curl -s https://ayden-app-388558128884.asia-south1.run.app/api/v1/traction
```

Documents to read: `docs/FOUNDER_BRIEF.md`, `docs/UNIT_ECONOMICS.md`, `docs/URL_AND_MEDIA.md`, `docs/PROGRESS_REPORT.md` (section 9 mirrors this file), `CONTRACT_CHANGES.md`.

## 7. Update, later on 22 Nov (commits `1587b20`, `d890396`)

Built after the first handoff. **All of it avoids `apps/api/src/roles/*` and the role tests**, so it will not conflict with role work.

- **Shareable work sample (opt in, revocable).** `POST/GET/DELETE /api/v1/reports/:id/share` (owner only) and a public `GET /api/v1/share/:token`. The token is `reportId.random` and lives on the stored report (`share` field, optional); deleting it switches the link off. The public payload has the name the learner typed, skills at or near target, badges, up to 4 verified quotes. **No gaps, no transcript, no scores.** Code: `apps/api/src/domain/share.ts`, route block in `apps/api/src/api/routes.ts`, tests in `apps/api/test/share.test.ts`. Web: `apps/web/src/features/share/` (`ShareCard` on the report page, public page `/s/:token`).
- **Certificate.** One SVG (`Certificate.tsx`) used for preview, PNG download, print/PDF and the QR code. One-click share to LinkedIn (profile and post), WhatsApp, X, and the phone share sheet with the image attached. Adds the `qrcode-generator` dependency. The wording says "practice simulation, not an accredited qualification or a hiring score". **Do not remove that line.**
- **Badges redesigned.** `apps/web/src/features/game/BadgeArt.tsx` now draws medals (earned, mastered after 2 fresh variants, locked). Symbol is chosen from the skill id and title by keyword, colour from the role, so **new or renamed skills still get a sensible badge with no changes needed**. The old Gemini image endpoint still exists but is no longer used. Progress page now has a badge shelf with a counter.
- **Landing hero** is a self-playing "first shift" preview (`features/landing/LiveShift.tsx`), labelled as a scripted example.
- **Visit counter.** `POST /api/v1/visit` (one call per tab session, no cookie, no IP, bots excluded), buffered in memory and flushed every 15 s; shown on `/traction` as visits, new browsers and the funnel. Two new counters: `visits`, `uniqueVisitors`.
- **Bug fixed:** "back to roles" returned to the simulation you had just left. `BackLink` now always goes to the page it names, and Exit replaces the simulation in history.
- **Languages.** Telugu is now hand-written alongside Hindi (`apps/web/src/i18n/te.ts`, 325 keys each; Hindi wording corrected). Landing hero, live preview, share card, work sample and badge shelf are translated. **Not translated:** the landing page sections below the hero, the `/traction` and `/feedback` pages, the certificate itself (kept in English on purpose), and mission content (English by design). Neither Hindi nor Telugu has been reviewed by a native speaker.
- **Docs.** `docs/UNIT_ECONOMICS.md` sections 6 to 8: cost of the whole architecture by scale, cost per hour of use, and the pricing and subscription hypotheses.

**Tanish, please:** (1) check that `/api/v1/share/:token` should stay public (it only returns what the learner chose to share); (2) decide whether sharing needs an abuse report link before real students use it; (3) look at Firestore index needs, none were added (share lookups are by report id).
