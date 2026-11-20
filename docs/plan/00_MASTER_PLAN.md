# 00 · Ayden Master Plan (read this first; shared by both Claudes and both founders)

**Team:** Ayden Times (Tanish Shitanshu, Sai Mohit Kotta) · **Event:** Startup Buildathon India 2026, Delhi City Buildathon (Google DeepMind + Google Cloud) · **Submission:** treat **Sat 21 Nov, 08:00 AM IST** as the hard deadline (the Day-2 email says submit by 8:00, arrive by 9:00; an earlier email says 9:00; verify on the dashboard) · **Goal:** rank 1.

---

## 1. The product in one paragraph

**Ayden is a first-90-days simulator.** A new graduate picks a role and rehearses a realistic workday with a **team of AI colleagues** (manager, reviewer, QA, buddy, a senior stakeholder) who act through tools the **engine** validates. They produce **real work artifacts** (code, commit, pull request, SBAR escalation, case memo, client update, SQL). A **deterministic engine plus a quote-verified judge** turns that into a **Skill X-ray**: where you are lacking, which skill, with your own words as evidence, how your self-rating compares with what you showed, and what to practise next. Practice drills on fresh variants then update your **Ramp Map**: the real first-90-days milestones of that job, rehearsed versus still ahead. It is **private to the learner**; colleges and employers see only anonymous group patterns (groups of 5+). No leaderboards.

**One line:** *Rehearse your first 90 days, in 25 minutes.*
**Slogans (pick in the deck):** "Your first 90 days, in 15." · "Start on day zero, not day one." · "Find the skill between you and the job. Fix it before you start." · "We don't test interns. We train them, privately."

**The target we state (as a target, never a result):** new hires spend about 60 to 90 days getting productive; Ayden aims to compress that to 15 to 30 days of *rehearsed readiness* by letting people practise the first-90-day milestones before day one. We measure rehearsal coverage and skill gaps closed, and propose a pilot to measure real ramp time.

## 2. Why this beats Forage, Artha-style simulators and "just ChatGPT"

| | Forage | Artha-style chat sim | A Gemini prompt | **Ayden** |
|---|---|---|---|---|
| Hands-on work | Pre-recorded tasks, model answers | Chat decisions | One conversation | **Real artifacts checked by code**: tests run in Google's sandbox, commit format, PR quality, SBAR completeness, numbers tied to data |
| The team | Static | Several characters, one script | One persona | **Multi-agent team with private goals**, proposals validated by the engine (visible Engine Trace) |
| Score | Certificate | Radar of 8 dimensions | Vibes | **Behaviour anchors**: code signals first, then a judge whose quotes the **server verifies verbatim** |
| Personal gap | No | Phrase to try tomorrow | No | **Skill X-ray with confidence gap** (self-rating vs shown) and **fresh-variant re-test** |
| Time dimension | One-off | One-off | None | **Ramp Map** of real onboarding milestones + consequences that return |
| Privacy | n/a | Shareable badge | n/a | **Private by default, k≥5 patterns, no leaderboards** |
| Roles | 90+ employers | 1 live track | any | **Role engine**: 5 roles from one engine; new role = a pack |

Caveat for speaking: "we did not find a product doing X" is not "nobody does X". Say it that way.

## 3. What mentors told us → what we built (every line is in the product or the deck)

| Mentor / speaker point | Where it lives |
|---|---|
| Role-specific, not company-specific (nobody gives us Amazon's data) | Role Packs, fictional companies, no company data needed |
| 60-90 days → 15-30 days is the impact | Ramp Map + target framing on slide 2 and the landing page |
| Show milestones: target vs achieved | Progress screen, Skill X-ray bars, badges tied to evidence |
| Gamify but no leaderboards | Milestones, streaks, mastery pips, evidence-linked badges only |
| Security matters (company code and data) | Security table, Secret Manager, code runs only in Google's sandbox, consent, redaction, export/delete |
| Not complete vibe coding; BDD/DDD, standard code style | `features/*.feature` first, domain-pure modules, repo follows its own CONTRIBUTING, Antigravity skills for standards |
| Business **and** tech judges; architecture diagram | `/how-it-works` page, deck slide, ARCHITECTURE.md |
| Working product with users onboarded | Live URL, real counters from `/system/status`, live cohort view from testers |
| GTM matters as much as product (Angel One) | Deck: beachhead, pricing assumption, channels, pilot plan (see `05_DEMO_DECK_GTM.md`) |
| Detailed submission: ideation, USP, target group, punchlines | Deck outline in `05` |
| Google AI + Cloud depth; Antigravity alongside | §6 Google map; Antigravity skills + screen recording |

## 4. Rubric → plan (targeting the maximum of every row)

| Criterion (weight) | What a top score needs | Our proof object |
|---|---|---|
| Functional product (30%) | Judge enters in one click on a phone and completes the whole loop; nothing dead | One-click `/demo`; QA matrix (48 rows) passed on a phone; scripted smoke + live smoke; real usage counters; fallback flagged in UI |
| Technical architecture and engineering (20%) | Clear separation, visible non-wrapper, tests, security | Engine Trace panel; `/how-it-works`; BDD features; ≥ 60 tests; `docs/SECURITY.md`; one-slide architecture; Conventional Commits history from the event |
| Google AI depth (20%) | Several distinct, real Gemini roles + real Cloud services + Google dev tooling | §6: ≥ 6 distinct Gemini uses and ≥ 5 Cloud services, each marked live/planned honestly; model IDs in the Trace |
| Problem-solution fit (15%) | Real, sourced, huge problem; solution maps directly | Role-specific ramp-up gap; sourced new-grad onboarding evidence; target stated as target; GTM with beachhead |
| UX, usability, accessibility (10%) | Google-like polish, mobile, keyboard, plain language, bilingual chrome | `01_FRONTEND_BRIEF.md`; EN/हिं chrome; a11y checks |
| Innovation (5% **and inside every row**) | Something a judge has not seen, shown live | "Model proposes, engine disposes" trace · quote-verified judge · confidence gap · artifact checks in Google's sandbox · Ramp Map · privacy tiers · **New variant** button proving dynamic scenarios |

## 5. The five roles and the guaranteed core

Software Engineer (flagship) · Banking Ops (KYC & payments) · Staff Nurse (ward handover) · Tech Consulting Analyst · Data Analyst (real BigQuery). Details in `04_ROLE_PACKS.md`. **Rollout order = guarantee order**: SWE → Banking → Nurse → Consulting → Data. A role is shown as `ready` only after it passes the smoke test; otherwise it appears as a non-clickable "Planned" card. Nothing fake is ever clickable.

**Pre-built vs dynamic:** the story skeleton, hidden truth, rubric and checks are pre-built so results are reliable. Dynamic: **Scenario Weaver** (personalised names, numbers, trap emphasis from the learner's profile and gaps; **New variant** button), **free-text agents** (Gemini function calling), **adaptive drills** (embeddings), **Role Compiler** (stretch, labelled draft). Say this plainly: "reliable core, dynamic surface."

## 6. Architecture and Google map

```
Browser SPA ──► Cloud Run (Fastify: API + engine + static web)
                 ├─ Engine (pure TS): clock, queue, hidden truth, ledger, validators
                 ├─ Agents ──► Gemini API (Interactions): colleagues (function calling), judge/weaver (structured output), embeddings, code_execution (sandbox)
                 ├─ Firestore  (sessions, events, reports, progress, cohorts)
                 ├─ Secret Manager · Cloud Logging
                 └─ BigQuery (Data role + anonymous analytics) · Sensitive Data Protection  [planned unless done]
Build: Antigravity + Agent Skills (.agents/skills) · AI Studio · Cloud Build + Artifact Registry (source deploy)
```

| Google piece | Purpose | Priority | Claim only when |
|---|---|---|---|
| Gemini 4 Hydrogen (function calling) | Colleague agents | P0 | on the request path |
| Gemini 4 Argon (structured output) | Judge, Director/Weaver | P0 | on the request path |
| Gemini code execution tool | Run learner code safely in Google's sandbox | P0 for SWE | check results parsed from sandbox output |
| `gemini-embedding-2` | Match gaps to drills | P1 | used in drill choice |
| Cloud Run + Cloud Build + Artifact Registry | Deploy | P0 | deployed |
| Firestore | Data | P0 | used |
| Secret Manager | API key | P0 | mounted |
| Cloud Logging | Observability | P0 | structured logs visible |
| Antigravity + Agent Skills | Build tooling, standards skills | P0 (visible) | screen recording + skill files in repo |
| BigQuery | Data role + analytics | P1 | queries/rows real |
| Sensitive Data Protection | PII redaction | P1 | API call in path |
| `gemini-decision-1` | binary anchors | P2 | smoke test passes |
| Gemini Live voice (SBAR phone call) | verbal escalation | cut unless time | built |
| ADK / Agent Runtime | agent framework | P2 | actually used (**we do not claim them otherwise**; the submitted form mentions ADK, so mention ADK honestly as the planned orchestration layer if unused) |

## 7. Privacy, integrity and gamification (design rules)

Learner owns the report and can export/delete. Consent screen states what is logged and who sees what. Company/college view: participation plus anonymous patterns, **minimum group size 5**, label `live` or `seeded demo`. First attempt is disclosed ("your first shift sets your starting point, private to you"), mastery needs two fresh variants, attempts capped at 2 per variant, badges attach to evidence, sharing is opt-in and positive-only. **No leaderboards, no per-person scores to employers.**

## 8. Scope tiers

| Tier | Contents |
|---|---|
| **P0 (must work, polished)** | Landing, roles, role detail, onboarding+consent, one-click demo; workspace with chat, items, editor, artifacts, checks, trace; **SWE mission end to end** with real sandbox checks; report (Skill X-ray); progress/Ramp Map; privacy centre; `/how-it-works`; Cloud Run live; scripted fallback; tests; security basics |
| **P0.5** | Banking and Nurse missions; drills for SWE |
| **P1** | Consulting; cohort console on live tester data; embeddings drill match; BigQuery analytics; SDP; Data Analyst mission |
| **P2** | `gemini-decision-1` anchors; Role Compiler; Google sign-in (Firebase Auth); Hindi polish |
| **Cut** | Voice (Live), image generation, real-time interrupts, payments, multi-tenant admin, statistical mastery models, manager view, "full day" mode |

## 9. Who does what, and how the two halves merge

* **Mohit's Claude** → `apps/web` only (UI). **Tanish's Claude** → `apps/api`, `packages/contract`, infra, deploy. **Tanish** → coordination, repo/billing/keys, users, deck, submission. **Mohit** → UI review, Antigravity-on-screen tasks, deck design, domain sanity checks on nurse/bank content if a friend can glance.
* One monorepo (`ayden`, private; name to confirm). Folder ownership prevents conflicts. Mohit's Claude commits on branch `web` (his git identity), Tanish's Claude merges to `main`.
* **Contract freeze v1.0 at the start.** Changes only via `CONTRACT_CHANGES.md`; backend owns `contract.ts`.
* **Integration point (~hour 4):** backend deploys scripted mode to Cloud Run; Mohit sets `VITE_API_BASE` + `VITE_API_MODE=live`. From then both sides fix issues against the real API. Final: one Docker build serves web + API from one URL.
* Commits on Tanish's machine: **his name and email only, no Claude co-author or attribution lines**. Mohit sets his own preference on his machine (recommended: same, so history is clean).

## 10. Timeline (relative; assume "start building" ≈ 21:30-22:00 IST)

| T+ | Backend (Tanish's Claude) | Frontend (Mohit's Claude) | Founders |
|---|---|---|---|
| 0:00 | Gemini smoke test, repo scaffold, contract v1.0 | Tokens, components, shell, mock layer | Tanish: approve repo; Mohit: clone |
| 1:00 | Cloud Run hello-world, Firestore, secrets | Landing, Roles, Role detail, Onboarding | Check billing/limits |
| 2:00-4:00 | Engine + SWE pack (scripted) + all routes → **deploy** | Workspace | Mohit: Antigravity task on screen |
| 4:00 | live agents, sandbox checks | **Flip to live API**, integration fixes | Tanish: share link with first testers |
| 5:30 | judge, report, progress, drills | Debrief, Progress | Testers (aim: 20+ real sessions) |
| 6:30 | Banking, Nurse packs | Privacy, How it works, Cohort | Domain glance at nurse/bank content |
| 7:30 | cohort live view, analytics, redaction | Polish, a11y, Hindi chrome | Deck + screenshots |
| **~05:30** | **Feature freeze**: deploy, phone test, secrets scan | Full QA matrix on phone | Demo recording (backup) |
| 05:30-07:30 | README, ARCHITECTURE, tag | | Deck PDF, demo video, **submit before 07:30** |

## 11. Claims guard (the judges have our submitted form)

| We may say | We may not say |
|---|---|
| "MVP in progress; built at the event." | "Launched", "live users", unless the counters show them |
| "Rehearses the first 90 days; target is 60-90 → 15-30 days of rehearsed readiness." | "Cuts ramp-up time by X%" (not measured) |
| "Scores are formative, with quoted evidence." | "Validated", "calibrated against job performance" |
| "Colleagues are Gemini function-calling agents validated by an engine." | "Powered by ADK / Agent Runtime / BigQuery / Live / Lyria / Nano Banana" unless built |
| "Nurse and bank scenarios are simplified training; not reviewed by a clinician or compliance professional." | "Clinically validated", "compliant" |
| "Our submitted form described the long-term vision (including a Gym API for AI agents). This weekend we built the learner platform and the engine; the Gym is roadmap." | Anything implying the Gym or calibrated score exists |
| "The earlier prototype began before the event; the Gemini, Cloud Run, engine and multi-agent work was built here." | Hiding the earlier repo |
| "Hindi UI strings are machine-assisted, not native-reviewed." | "Reviewed by native editors" |

## 12. Decision log: three passes of critique (done inline; each pass changed the plan)

**Pass 1: concept.** Candidates: Beat-the-Agent, Trust Calibration, Skill X-ray, Gym API, company-SOP simulator. Chosen: **Skill X-ray on the First-90-days engine** because it matches your brief (gaps + skills + progress), the mentors (role-specific, milestones, no leaderboards) and the rubric (real artifacts, deep Google). Gym demoted to roadmap; calibration demoted to "planned pilot".

**Pass 2: red team (learner, judge, buyer, engineer).**
1. *"Five roles = five shallow chatbots."* → every role has at least one **artifact checked by code** (tests, commit regex, SBAR numbers, memo citations, numbers-tie-to-data, SQL result match); roles share one engine.
2. *"Pre-built means scripted."* → Weaver + free-text agents + New variant button + Trace; honest "reliable core, dynamic surface."
3. *"Who gives you their data?"* → role libraries, fictional companies; company SOP compiler is a later pilot idea.
4. *"Interns will cheat."* → private by default, nothing to gain by gaming, mastery needs fresh variants, attempts capped, no leaderboards.
5. *"Vibe-coded?"* → BDD first, domain purity, tests, Antigravity skills encoding standards, secrets rules, the repo mirrors the habits the product teaches.
6. *"Why would a company pay?"* → pilot: assign in week 1, see **participation and group-level skill gaps** to fix curriculum; individual data never leaves the learner.
7. *"Code execution is dangerous."* → learner code only runs in Google's sandbox.

**Pass 3: feasibility.** ~8.5 hours to freeze for two Claudes. → Contract-first parallel build; scripted mode deployed by hour ~4 so UI integrates early; SWE guaranteed, others tiered with explicit cut order; reviewers' earlier warning ("twice too big") respected by cutting voice, images, full-day mode, ADK claims; **rate limits** flagged as the top operational risk (20 testers on a free key).

## 13. Risks (ranked) and mitigations

1. **Time/scope** → tiers, cut order, scripted fallback, early deploy, freeze at 05:30.
2. **Gemini rate limits / latency with 20 testers** → check AI Studio quota and billing at hour 0; flash-class model for chat, Argon only for judge/weaver; per-session caps; circuit breaker to scripted mode (flagged); cached judgements.
3. **Sandbox/code-execution flakiness** → 20-minute smoke test decides path; static-check fallback labelled; results cached.
4. **Merge friction between two Claudes** → monorepo ownership, contract freeze, mock mode, integration at hour 4.
5. **Over-claiming vs the submitted form** → claims guard; `/system/status` marks services honestly.
6. **Secrets** → Secret Manager, scans before every push; the leaked Neon password fragment must be rotated after evaluation.
7. **Domain correctness of nurse/bank content** → simplified, fictional, labelled; ask any nurse/bank friend for a 10-minute glance if possible.

## 14. Open items for Tanish (answer in the first 15 minutes)

1. Mohit's GitHub username, and OK to create the private repo (name suggestion `ayden`, or `ayden-times`).
2. AI Studio key: which Google project, is billing/higher quota available? (AI Pro does not raise API limits.) Event credits link: `g.dev/credits/startup-buildathon-india-2026`.
3. Which Google account for Antigravity (personal Gmail with AI Pro, **not** the SNU Workspace address, which gets no Antigravity plan).
4. Dashboard check: exact submission window and whether the demo video is required.
5. Fifth role: Data Analyst (real BigQuery) assumed. Swap if you prefer another.

## 15. Documents and who receives what

| File | Mohit's Claude | Tanish's Claude |
|---|---|---|
| `00_MASTER_PLAN.md` | ✅ | ✅ |
| `01_FRONTEND_BRIEF.md` | ✅ | (reference) |
| `02_API_CONTRACT.md` | ✅ | ✅ |
| `contract.ts` | ✅ | ✅ |
| `03_BACKEND_PLAN.md` | – | ✅ |
| `04_ROLE_PACKS.md` | optional (reference) | ✅ |
| `05_DEMO_DECK_GTM.md` | – | ✅ (founders use it for deck/pitch) |
