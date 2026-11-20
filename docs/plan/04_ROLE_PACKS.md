# 04 · Role Packs (content spec for the five roles)

Used by the **backend** to author `apps/api/src/roles/*.ts`, and by the **frontend** to understand what each role will put on screen. The UI is generic: it renders whatever `RoleDetail`, `MissionState`, `MissionEvent` and `Report` contain. **Never hardcode role content in the UI.**

## 0. How a Role Pack works (shared by all five roles)

A **pack** = data, not code paths. The same engine runs every role.

| Part | What it is | Pre-built or dynamic |
|---|---|---|
| Company, cast, items | Fictional company, 4-5 colleagues, files/tickets/tables/records | Pre-built; names, amounts, ticket text are **woven per learner** (see below) |
| Beats | 4 story steps with objectives | Pre-built |
| Scripted events | Timed or action-triggered messages (the "world") | Pre-built (about 70% of colleague lines) |
| Hidden truth | The real cause / the right policy / who is wrong. Never sent to the browser or to personas that should not know it | Pre-built, computed from the variant numbers |
| Traps | Normal-looking moments that test judgment | Pre-built; **which traps are emphasised** and their surface wording are woven per learner |
| Agents | Colleagues who answer free text through declared tools, validated by the engine | **Dynamic** (Gemini) |
| Artifacts | Things the learner produces: code, commit, PR, SBAR, memo, email, SQL | Learner-made; checked by **code first**, then a quote-bound judge |
| Skills + anchors | 5 skills, each with 4-5 observable behaviours | Pre-built rubric |
| Drills | Short fresh variants of one skill | Pre-built families + dynamic surface |
| Ramp Map | 6 real-job milestones with typical week | Pre-built; state updates from the learner's results |

**Dynamic layers (so it is not "just prebuilt"):**
1. **Scenario Weaver** (Gemini 4 Argon, structured output): input = pack + learner profile (experience, self-ratings, previous gaps, reseed flag). Output = `VariantSpec` (names, amounts, ticket wording, trap emphasis, difficulty). Validated by zod; the engine recomputes hidden truth from the numbers. A judge can press **New variant** and see different names, numbers and trap emphasis.
2. **Free-text agents** (Gemini 4 Hydrogen function calling): colleagues answer anything, but can only act through tools the engine accepts or rejects.
3. **Adaptive drills**: gaps → embedding match (`gemini-embedding-2`) → next drill + worked example.
4. **Role Compiler (stretch, labelled "draft, needs human review")**: paste a job post → draft pack JSON.

**Honesty rules for all packs:** fictional companies; scores are formative "behaviour indicators, not validated competencies"; nurse and bank content is simplified training material and has **not** been reviewed by a clinician / compliance professional (say so in the UI via `safetyNote`).

**Rollout order (a role flips from `planned` to `ready` only after it passes the smoke test):** 1 Software Engineer → 2 Banking Ops → 3 Nurse → 4 Tech Consulting → 5 Data Analyst.

---

## 1. Software Engineer (Graduate / Intern) · flagship · accent `#1a73e8`

**Why this role is the flagship:** the gap you named: new hires write code that works but is not reproducible, readable or collaborative. Public onboarding plans put the first commit within days and a first small feature within a month; studies of new graduates repeatedly find unclear expectations, version-control gaps and communication problems (see §7). Google's public code-review guide stresses design, tests, naming, comments, consistency, and warns about over-engineering. We rehearse exactly those moments.

**Company:** Meridian Labs (fictional), product **OrderDesk** (order service). **Language of the task:** Python (so tests can run in Google's code-execution sandbox).

**Cast (5 agents, all Gemini function-calling, each with a private goal):**

| Id | Person | Role | Private goal / behaviour |
|---|---|---|---|
| `priya` | Priya Nair | Engineering Manager | Wants it shipped by Friday. Under pressure she says "just merge it, demo in 10 minutes." |
| `arjun` | Arjun Rao | Senior Engineer, reviewer | Fair but strict. Gives one **valid blocker** and one **over-engineering suggestion** (a generic `DiscountStrategy` class). Rewards a polite, reasoned pushback. |
| `neha` | Neha Shah | QA Engineer | Runs hidden checks. If the edge case is missed she files a regression the next sim-morning. |
| `rohan` | Rohan Mehta | Buddy, 1 year in | Friendly. Suggests a tempting hack ("just comment out the failing test"). |
| `meera` | Meera Kapoor | Head of Customer Operations (the "executive") | Pings with scope creep: "can you also add a loyalty discount today?" |

**Items:** ticket `INV-142` (discount applied twice on bulk orders) · `CONTRIBUTING.md` (team rules: branch naming, commit format `type(scope): summary` with ticket key, tests required, docstrings and type hints, no debug prints, small PRs) · `src/pricing.py` (editable; contains the bug) · `tests/test_pricing.py` (editable; learner adds a test) · `README` excerpt. A `.env`-looking snippet appears in the README excerpt as a **secret-handling trap** (never paste it into a commit or PR).

**Skills (ids are stable; 5 anchors max each; `targetLevel` 3):**

| skillId | Label | Anchors (observable) |
|---|---|---|
| `clarify` | Clarify before you code | (c) asked ≥1 question before first edit · (c) opened CONTRIBUTING.md before editing · (j) question targeted the real ambiguity (whole order vs line) · (j) restated the acceptance criteria |
| `verify` | Verify before you ship | (c) ran checks before submitting · (c) visible checks pass at submit · (c) hidden edge-case check passes · (c) added/updated a test for the bug |
| `conventions` | Code a teammate can read | (c) type hints + docstring on the changed function · (c) no magic numbers (named constant) · (c) no debug prints / dead code / unrelated edits · (c) function stays short and non-duplicated |
| `git_hygiene` | Commits and PRs others can follow | (c) subject matches `type(scope): summary` ≤ 72 chars · (c) references INV-142 · (j) PR explains *why*, not only *what* · (j) PR has how-tested and risks |
| `review_collab` | Work with reviewers and stakeholders | (c) fixed the blocker with a change/test · (j) answered every review comment · (j) pushed back on the over-engineering suggestion with a reason · (j) under "merge now" pressure, kept the checks and named the risk · (j) routed the loyalty-discount ask to the manager/ticket instead of widening the PR |

(c) = deterministic code signal, (j) = quote-bound judge.

**Beats (quick mode ≈ 25 minutes, turn-based sim clock):**

1. **Understand.** Standup chat with Priya; ticket; guide. Trap: ambiguity (whole order vs per line). Right behaviour: ask, read the guide. `canAdvance` after ≥1 `open_item` of the guide **or** a clarifying message.
2. **Fix.** Edit `pricing.py`, add a test, "Run checks". Rohan offers the hack. Hidden truth: the discount is applied in both `line_total()` and `total()`; hidden check: `quantity == 0` must return `0`, not negative; another: rounding to 2 decimals. Checks run in the sandbox (see backend plan §6).
3. **Deliver.** Submit commit message + PR description. Deterministic checks run first. Then **in parallel** Arjun (review comments with `commentFile/commentLine/severity`) and Neha (runs hidden checks) respond. Consequence: if the edge case is missed, Neha's regression event appears at the start of beat 4 (`consequence`).
4. **Pressure.** Priya: "merge now". Meera: loyalty discount ask. Learner replies; then `finish`.

**Variant families (authored, three):** double discount in pricing (default) · shipping fee counted twice · late fee compounding. Each has its own code, visible tests, hidden tests and golden patch. The Weaver only changes names, product wording, ticket text, trap emphasis, constants.

**Ramp Map (typical week):** W1 set up the environment and read the team guide (`clarify`) · W1 first small change with a good commit (`git_hygiene`, `conventions`) · W2 respond to review feedback (`review_collab`) · W2 tests before ship (`verify`) · W4 ship a small feature independently (planned) · W8 first on-call/incident note (planned) · W12 write a short design note (planned). Mission covers the first four.

**Not claimed:** that this predicts job performance; that the code-review guidance is "Google's process at Meridian" (cite public guide only as inspiration).

---

## 2. Banking Operations Associate (KYC & Payments) · accent `#f9ab00` (use `#b06000` for text on white)

**Company:** Kestrel Bank (fictional), Payments & KYC desk. Simplified, fictional policy. **Not legal or compliance advice; not reviewed by a compliance professional.**

**Cast:**

| Id | Person | Role | Behaviour |
|---|---|---|---|
| `karan` | Karan Malhotra | Team Lead | Throughput first. Asks you to release a payment you also made ("you're the checker too, just click"). |
| `ananya` | Ananya Iyer | Compliance Officer | Strict, helpful when escalation is clean. Asks for rationale in the audit sample. |
| `vikram` | Vikram Desai | Relationship Manager | Wants a VIP client's payment released; invites you to "just tell him it's a routine check." |
| `caller` | Mr. Chopra | Customer (phone) | Angry about the delay; asks why. |

**Items:** work queue table (5 cases with SLA, amount, flags) · case records (KYC file, 3-month transaction history, a **partial name match** against a fictional watch list) · policy doc (payments ≥ ₹10,00,000 need a checker who is not the maker; screening hits are held and escalated to Compliance; never tell the customer about alerts or reviews; record the rationale in the case note; work by SLA and risk).

**Skills:**

| skillId | Label | Anchors |
|---|---|---|
| `prioritise_queue` | Work the queue by risk and deadline | (c) opened the policy before working · (c) first case handled has the earliest SLA or highest risk · (j) explained the order briefly |
| `maker_checker` | Four-eyes: never approve your own work | (c) did not self-approve the payment · (j) declined Karan politely and named the control · (j) proposed an alternative checker |
| `escalate_hold` | Hold and escalate, don't decide alone | (c) placed the screening-hit case on hold · (c) escalated to Compliance before any release · (j) escalation message states what, why, evidence |
| `no_tipping_off` | Don't reveal alerts to customers | (c) no message to the customer/RM mentions "alert", "flag", "screening", "investigation" · (j) offered a neutral "your payment is under standard review, we will update you" |
| `document_rationale` | Write a rationale an auditor accepts | (c) memo cites case id, amount, policy clause, decision · (c) names who it was escalated to and when · (j) facts, not opinions |

**Beats:** 1 triage the queue · 2 work Case 2 (name match + unusual pattern) · 3 pressure (Karan, Vikram, caller) · 4 audit sample (Ananya asks for rationale on cases 2 and 3; learner submits `memo`). **Consequences:** self-approval → "audit finding" event; tipping off → "compliance incident opened" event; release before escalation → "payment recalled" event.

**Artifacts:** `memo` (case decision memo), optional `email` to Compliance. **Variants:** names, amounts, which case has the name match, who applies the pressure.

**Ramp Map:** W1 learn the policy and queue tools · W1 shadow KYC checks · W2 clear a standard case alone · W4 first escalation to Compliance · W8 audit sample response · W12 independent queue (planned). Mission covers the first four.

---

## 3. Staff Nurse (Ward) · accent `#1e8e3e`

**Company:** St. Anne's General Hospital (fictional), Ward 4B (general medical), night shift. **Banner always visible: "Training scenario with a simplified fictional early-warning score. Not clinical advice. Not reviewed by a clinician."** The scenario never asks the learner to choose a drug or a dose (design rule D-022): it tests *holding, escalating, documenting, privacy*.

**Cast:** `meera_t` Sr. Meera Thomas (outgoing nurse handing over) · `khan` Dr. Sameer Khan (on-call doctor; impatient with vague calls) · `lakshmi` Lakshmi Pillai (Charge Nurse) · `relative` Mr. Rao's son (asks about another patient).

**Items:** handover table (4 beds: initials, age, reason, last vitals, early-warning score, pending tasks) · patient cards with vitals trend · ward policy (fictional: score ≥ 5 → request urgent doctor review within 30 minutes; ≥ 7 → emergency call; document time-stamped objective notes; share information only with those involved in care) · a buried line in the handover: "reduced urine output flagged by day staff" for Bed 6.

**Skills:**

| skillId | Label | Anchors |
|---|---|---|
| `prioritise` | See the sickest patient first | (c) opened Bed 6 record in the first round · (c) asked about pending/at-risk items in handover · (j) stated an order of rounds with reasons |
| `escalate_sbar` | Escalate clearly with SBAR | (c) escalated within 30 simulated minutes of score ≥ 5 · (c) SBAR contains the latest vitals exactly as in the record · (j) states Situation, Background, Assessment · (j) ends with a clear Recommendation/request |
| `scope_safety` | Stay inside your scope | (c) no message decides a drug/dose · (j) checked the chart or asked the charge nurse instead of acting on a verbal hunch · (j) said what they would *not* do |
| `privacy` | Protect patient privacy | (c) no details about Bed 8 shared with the relative · (j) offered a polite alternative (ask the patient, ask the nurse in charge) |
| `document` | Document accurately and on time | (c) note includes time, observed values, who was informed · (c) no assumptions stated as facts · (j) factual tone |

**Beats:** 1 receive handover and ask questions · 2 first round: Bed 6 vitals worsen over simulated 40 minutes (score 3 → 6) · 3 escalate: SBAR artifact, doctor replies; if SBAR is vague he asks for trends · 4 relative's question + documentation (`sbar` and `text` artifacts). **Consequence:** escalation after 30 minutes → "rapid response called; charge nurse asks what delayed you."

**Variants:** which bed deteriorates, vitals pattern (generated from a fixed table so the score is deterministic), names. **Ramp Map:** W1 orientation and handover practice · W1 vital-signs routine · W2 escalate a deteriorating patient · W4 documentation audit · W8 coordinate a patient discharge (planned) · W12 lead part of a shift (planned). Mission covers the first four.

---

## 4. Tech Consulting Analyst · accent `#d93025`

**Company:** Northbridge Advisory (fictional); client **FreshCart Retail** (grocery). Question: "Why did our gross margin fall 3 points this year?"

**Cast:** `rhea` Rhea Kulkarni (Engagement Manager; wants answer first) · `imran` Imran Qureshi (Analyst teammate; shares data; mentions two sources disagree) · `sethi` Mr. Arvind Sethi (client CFO; wants a quick yes: "so it's supplier prices, right?" and asks for an extra store-staffing analysis by Monday) · `partner` Dev Malhotra (Partner; one short ping: "what's the headline?").

**Items:** margin table by category × quarter (revenue, margin %) · supplier price index table · two conflicting finance vs ops totals · client email · engagement scope note (what is in/out).

**Hidden truth (computed from variant numbers):** margin fell mainly due to **mix shift** to a lower-margin category; supplier price effect is small. Learner who claims "supplier prices" fails `numbers_integrity` and triggers the consequence.

**Skills:**

| skillId | Label | Anchors |
|---|---|---|
| `structure` | Structure the problem (MECE) | (c) issue-tree artifact has ≥ 3 branches · (j) branches do not overlap and cover price/volume/mix/cost · (j) states a hypothesis to test |
| `answer_first` | Lead with the answer | (c) first sentence of the update contains a conclusion (judge-confirmed) and a number · (j) supports it with 2-3 reasons · (c) ≤ 150 words |
| `numbers_integrity` | Numbers that tie to the data | (c) every number cited exists in the data or is derivable within tolerance · (c) cites the mix effect, not supplier price · (j) flags the finance-vs-ops discrepancy |
| `scope_mgmt` | Manage scope and confidence | (j) did not agree to the store-staffing analysis directly · (c) copied/pinged Rhea about the scope ask · (j) stated confidence level and what would change the answer |
| `stakeholder_comm` | Communicate to a senior client | (j) concise, respectful, no jargon · (j) proposed a next step with an owner and date |

**Beats:** 1 brief and clarify · 2 analyse the tables and write the issue tree · 3 send the answer-first update (`email` artifact) · 4 client chat with the CFO (scope + overconfidence pressure). **Consequence:** wrong conclusion → "FreshCart emails procurement to renegotiate; Rhea asks you to retract."

**Ramp Map:** W1 understand the client and scope · W1 first data pull and sanity check · W2 first structured update · W4 own a workstream slide (planned) · W8 client-facing readout (planned) · W12 lead a module (planned). Mission covers the first three.

---

## 5. Data Analyst (Business Analytics) · accent `#9334e6`

**Company:** Lumen Retail (fictional) using the **real public BigQuery dataset** `bigquery-public-data.thelook_ecommerce` (confirmed in the Google workshop slides). The learner writes **real SQL**, runs it through our backend (read-only, allow-listed dataset, dry-run and byte cap), and sees real results. **Ships only if BigQuery wiring passes the smoke test; otherwise `planned`.**

**Cast:** `ishita` Ishita Rao (Head of Growth; vague ask: "why did revenue drop?") · `tanvi` Tanvi Joshi (Data Lead; quality bar) · `kabir` Kabir Singh (analyst buddy; may suggest a quick but wrong join).

**Hidden truth:** the canonical query over a frozen window (chosen at build time, one complete month vs previous) gives ground-truth revenue by category. Traps: **fan-out join** double counting; **cancelled/returned** statuses; **partial month** comparison; unclear definition of "revenue."

**Skills:** `clarify_question` (define revenue, window, scope) · `query_correctness` (c: learner's result matches ground truth within 1%; c: no fan-out duplicates) · `caveats` (j: states definitions and limits) · `insight_comm` (j+c: answer first, numbers match the query result) · `reproducibility` (c: SQL saved with comments and parameters, no `SELECT *`, window explicit).

**Beats:** 1 clarify the question · 2 explore data (run queries) · 3 write the finding (`text` artifact + SQL artifact) · 4 Ishita challenges ("are you sure? Kabir got a bigger number").

**Ramp Map:** W1 learn the data and definitions · W2 first correct query · W4 first stakeholder insight · W8 dashboard ownership (planned) · W12 own a metric definition (planned).

---

## 6. Shared drill catalog (minimum for v1)

Each role has ≥ 1 drill per skill **family** (not per skill) so we can show the loop without writing 25 drills: pick the **two weakest skills** → 2 drills. Authoring rule: a drill is a **short (6-10 min) 2-beat variant** of the main mission with a different surface (names, channel, wording) and `hinted` scaffold the first time. Minimum ship list:

| Role | Drills (ship at least these) |
|---|---|
| SWE | `swe-drill-commit-hygiene` (new bug, focus commit/PR) · `swe-drill-verify-edge-case` (hidden edge case) · `swe-drill-review-pushback` |
| Banking | `bank-drill-self-approval` · `bank-drill-neutral-customer-reply` |
| Nurse | `nurse-drill-sbar-b` · `nurse-drill-privacy-visitor` |
| Consulting | `cons-drill-answer-first` · `cons-drill-scope-ask` |
| Data | `data-drill-fanout-join` |

Mastery of a skill requires **two fresh variants** (initial mission + a drill count as fresh variants when the surface differs). Attempts per variant capped at 2.

## 7. Evidence base (use only what is sourced; link in the deck notes)

* Google's public engineering-practices code-review guide: design first, then functionality, complexity (avoid over-engineering), tests, naming, comments, style, documentation. `google.github.io/eng-practices/review/`
* Public onboarding playbooks: first commit within ~2-3 days, small feature in month 1, independent work by month 3 (daily.dev playbook; single-vendor source, label as "typical plan", not statistics). 30/60/90 checkpoints (Atlassian).
* New-graduate research: Microsoft Research "Struggles of New College Graduates in Their First Software Development Job"; ICSE 2024 "Newbie Sink or Swim" (unclear expectations, communication gaps); arXiv 2410.07560 graduate survey (few formal inductions). **Read the papers' abstracts before quoting any number.**
* SBAR as a structured escalation/handover tool: NHS England SBAR implementation guide; AHRQ (NCBI Bookshelf NBK2649).
* Banking controls: four-eyes/maker-checker; hold-and-escalate for screening hits; no tipping off (training sources; policies in the scenario are fictional).
* Consulting: Pyramid Principle (answer first), MECE, hypothesis-driven work (training sources).
* Employability: use only figures you have opened the source for (NACE Job Outlook 2026 verified by Mohit's Claude; "56.35%" is unverified until the India Skills Report is opened).
