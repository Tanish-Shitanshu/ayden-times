# Founder brief: know your own product

Read this before any investor meeting. Everything here is true as of 22 Nov 2026 and checked against the code or Google's published pages. Anything that is an estimate says so.

---

## 1. The pitch in 30 seconds (say it exactly like this)

> New graduates get judged on day-one work, but nobody lets them practise it. Ayden is a rehearsal for the first 90 days. You work a realistic day with an AI team, you do real work, like code that runs in Google's sandbox, a pull request, an escalation, a board update. Then we show you which skills you are missing, with your own words as evidence. Colleges and employers see only anonymous group patterns. It is live today, and we have tested it with real students.

Rules: one idea per sentence. A number beats an adjective. Stop when you have said it.

---

## 2. How Ayden works, in plain words

1. **A learner picks a role** and works a 20-minute scenario with AI colleagues (a manager, a reviewer, a customer, an investor).
2. **The colleagues are real Gemini models**, each with a personality and limited knowledge. They talk back in their own words.
3. **A deterministic engine, not the AI, decides what is allowed.** The model proposes a reply; the engine checks it against the scenario's rules and what that person is allowed to know. This is the "model proposes, engine decides" rule, shown live in the Engine Trace.
4. **Real work is checked for real.** For the Software Engineer role the learner's code runs in Google's code-execution sandbox, never on our server.
5. **Scoring is evidence-first.** Code signals first. Then a Gemini judge scores behaviours from the learner's own words, twice. The server checks every quote against what the learner actually wrote. If the two runs disagree, the skill is marked "uncertain" instead of guessed.
6. **The learner gets a private Skill X-ray**: what they said about themselves versus what they showed, with quotes, badges and a short drill for gaps.

**What is scripted and what is AI:** the scenario, the events and the scoring rules are written by us. The colleagues' replies, the opening message and the judging are Gemini. If Gemini is down or rate-limited, a labelled scripted fallback keeps the demo running, and the UI says so.

---

## 3. Architecture and why we chose each piece

| Choice | Why | What we rejected | Cost at our scale |
|---|---|---|---|
| **One Cloud Run service** serves the API and the web app | One deploy, one URL, no cross-site cookie problems, scales to zero or stays warm | Separate frontend host plus API | About $7 to $10 a month to keep one instance warm (estimate; check Billing) |
| **Gemini Flash-Lite models** (`gemini-3.5-flash-lite` for colleagues, `gemini-3.1-flash-lite` for judge and sandbox) | Cheapest Gemini tier that handles function calling and structured output | Gemini 4 and bigger Flash models: hung or hit quota on a free key, and cost 3 to 5 times more | $0.25 to $0.30 per million input tokens, $1.50 to $2.50 per million output |
| **Function calling** for colleagues | Replies arrive as validated tool calls the engine can accept or reject | Free-text chat with no checks | Included in token price |
| **Structured output** for the judge | Guarantees parseable scores; lets us verify quotes | Parsing prose | Included |
| **Gemini code execution** for learner code | Untrusted code runs in Google's sandbox, not on our machine | Running Python ourselves (a security risk) | Billed as normal tokens |
| **Firestore** | Serverless, no database to run, generous free tier | Cloud SQL (always-on, costs more) | Free tier covers 50,000 reads and 20,000 writes a day |
| **Secret Manager** | API keys never sit in the repo or the container image | Env vars in code | Cents a month |
| **Sensitive Data Protection** | Redacts personal data before text reaches Gemini | Trusting learners not to type personal data | Pay per volume; trivial at this size |
| **BigQuery** | Anonymous skill-pattern rows so a college can later ask "which skill is weakest across my batch?" | Querying Firestore for analytics | See the Q&A below: effectively free at our scale |
| **Vertex AI image model + Cloud Storage** | One illustrated badge per skill, generated once and cached forever | Stock icons | About $0.034 per image, once, so around $1 in total |
| **Cloud Translation + Gemini speech** | The interface in 13 languages, including Hindi; "Listen" on colleague messages | English only | Free monthly quota, then small |
| **Circuit breaker and key failover** | If Gemini rate-limits, we retry, fail over to a backup key, then fall back to a labelled scripted mode | Showing an error to the learner | Free |

**Why not one big prompt?** A single chatbot would drift, leak information it should not know, and could not be scored consistently. The engine gives us repeatability, safety rules and an audit trail, and the AI gives us realism.

---

## 4. The questions investors will ask, with answers

**"Why BigQuery? Isn't it expensive?"**
BigQuery is free up to 1 TB of queries and 10 GB of storage a month. We store a few hundred bytes per finished mission. At 100,000 missions that is well under 1 GB, so the cost is zero. We use it because colleges will ask for batch-level patterns, and BigQuery answers those without touching learner data. It is not on the learner's critical path: if it fails, nothing breaks.

**"What does an hour of use cost you?"**
Our model is cheap Flash-Lite tier. We **measure** it: the live page `/traction` shows the AI cost per completed mission and per hour, counted from the token usage Gemini reports and priced at Google's published rates. Before measurement, our estimate is **about $0.05 to $0.25 per hour of practice**. Read the live figure and quote that, not the estimate.

**"Then how do you make money?"**
These are hypotheses to test in the pilot, not facts:
- Colleges and placement cells: a per-student price per semester, for example ₹200 to ₹400.
- Employers onboarding graduates: a per-hire price, for example ₹1,500 to ₹3,000.
- Assuming about 3 hours of practice per learner per semester, AI cost is roughly ₹10 to ₹40 per learner, so gross margin at ₹200 to ₹400 is around 80 to 95 percent. Recompute this with the measured cost on `/traction`.
See `docs/UNIT_ECONOMICS.md` for the arithmetic.

**"Is it just ChatGPT with a prompt?"**
No. A chat tells you what to do. Ayden watches what you do. It has state, hidden checks, code run in a sandbox, knowledge boundaries, consequences that come back later, and quote-verified scoring. The AI is one layer; the engine is the product.

**"How do you know the scores are right?"**
We do not claim they are validated. They are formative feedback with quotes the learner can inspect. Validation against job performance is what the pilot is for. We say that on the product itself.

**"What about privacy?"**
The report is private to the learner. Colleges and employers see only anonymous group patterns, in groups of 5 or more. There are no leaderboards. A learner can export or delete everything. Personal data is redacted before it reaches Gemini. **One honest caveat:** Google's free Gemini tier may use content to improve its products; the paid tier does not. Before real students use it at scale, billing should be on so the paid terms apply.

**"What if Gemini goes down or gets expensive?"**
A circuit breaker and a labelled scripted fallback keep it running, and a backup key takes over on quota errors. Costs are per token, so they scale with use and are small per learner. Prices for some larger Flash models double on 1 January 2027; Flash-Lite, which we use, is unchanged.

**"Why these roles?"**
Each is a real entry or early-leadership role where the first weeks decide whether someone is trusted. See section 5.

**"Who reviewed the nurse and banking content?"**
No clinician or compliance professional has. The scenarios are simplified, fictional and labelled that way. Reviewing them with a nursing educator and a bank compliance officer is the first pilot step.

**"Who is the competition?"**
Interview-prep and quiz apps test answers. Corporate simulation vendors are slow, bespoke and expensive per scenario. We are fast to author (a role pack is one file), cheap to run, and evidence-based. Be careful not to say "no competitors".

**"What do you need?"**
Say a specific ask. For example: introductions to two colleges for a 200-student pilot, and funding to review the scenarios with domain experts.

---

## 5. The six roles: why each is relevant, and the honest limits

| Role | Real job it rehearses | What it tests | Where it is strong | Honest limit |
|---|---|---|---|---|
| **Software Engineer** | First pull request at a product company | Asking before coding, tests, commits and PRs, handling a reviewer under deadline pressure | Code really runs and fails or passes in Google's sandbox; hidden checks | One codebase, two ticket types; not a full engineering day |
| **Banking Operations (KYC and payments)** | Operations associate on a payments desk | Maker-checker (four-eyes), holding and escalating a screening hit, not tipping off a customer, audit-ready notes | Maps to real AML controls in Indian banks | Simplified fictional policy; not reviewed by compliance |
| **Staff Nurse (ward)** | Night-shift handover | Early-warning escalation with SBAR, scope of practice, patient privacy, factual documentation | Realistic deterioration and a clear escalation rule | Simplified fictional score, not NEWS2; not reviewed by a clinician; never asks you to choose a drug or dose |
| **Consulting Analyst** | First client project | Structuring a problem, answer-first writing, numbers that tie to data, scope control | A classic margin-mix problem with a data conflict | Retail margin case only |
| **Startup CEO (new)** | First board cycle at a seed-stage startup | Deciding with runway numbers, writing a decision memo, disclosing a security incident, refusing to hide it, supporting a team member, a short honest investor update | Numbers vary per variant; the honest answer costs something, which is the lesson | Fictional company; a policy we wrote, not legal or financial advice |
| **Data Analyst** | Planned | Real SQL on a BigQuery public dataset | Not built | Shown as "Planned" and not clickable |

---

## 6. How to pitch (what the feedback you received is telling you)

You said the pitch was dramatic, off the point, and someone covering for someone else was not precise. Fixes:

**Structure for a 10-minute investor pitch**
1. Problem, one sentence and one number or fact (60 seconds).
2. Insight: practise before day one, with evidence (45 seconds).
3. Demo: the 64-second video, then stop talking over it (2 minutes).
4. Why it works: engine decides, sandbox, quote-verified scoring (90 seconds).
5. Traction: show `/traction` live. Real numbers only (90 seconds).
6. Economics: cost per hour measured, price hypothesis, margin (90 seconds).
7. Roadmap and the pilot (60 seconds).
8. The ask (30 seconds). Then questions.

**Delivery rules**
- No story longer than 15 seconds. If it does not set up a number, cut it.
- Lead with the answer, then one reason. This is the skill Ayden teaches; use it.
- If you do not know, say: "I don't have that number. I'll send it by tomorrow." Never guess.
- One person answers each question. Agree it in advance: **Mohit: product, users, traction, the demo. Tanish: architecture, cloud, cost, security.** If your teammate starts answering, stay quiet unless something is wrong. Do not top up their answer.
- Do not say: validated, launched, "thousands of users", ADK, Antigravity, Gemini Live. Do say: "MVP", "pilot", "formative feedback".
- Slow down. Short sentences. Pause after a number.

**Practice**: run the 10 minutes twice with a timer, and have one teammate ask only hard questions from section 4.

---

## 7. Traction plan for today (about 50 testers)

1. Share the site link or a QR code (the `/feedback` page works on any phone).
2. Ask each person to do **one 5-minute rehearsal** of the role closest to them. Offer "Try the demo".
3. At the end the report page shows a short feedback form: stars, 0 to 10 recommend, a comment, and an optional photo with a tick-box to show it publicly.
4. Everything appears live at `/traction`: testers, average rating, NPS, roles tried, and testimonials from people who agreed to be shown.
5. Tomorrow, show `/traction` on screen. Quote only what is on it.

**Honesty rules:** do not edit numbers, do not seed fake feedback, and say "missions completed includes our own testing". The page already labels it.
