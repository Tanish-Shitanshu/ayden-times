# Unit economics: what Ayden costs and what it could earn

Status: **estimates plus one live measurement.** The live number is on `/traction` ("What a rehearsal costs us"), counted from the token usage Gemini reports on every call and priced at Google's published paid-tier rates. Quote that number in the room. The tables below explain where it comes from and what to expect.

Prices are Google's published list prices as read on 22 Nov 2026 (Gemini API pricing page). Re-check before you quote them.

## 1. AI cost: the part that scales with use

| Model | Used for | Input per 1M tokens | Output per 1M tokens |
|---|---|---|---|
| `gemini-3.5-flash-lite` | Colleague replies (function calling) | $0.30 | $2.50 |
| `gemini-3.1-flash-lite` | Judge, scenario weaver, sandbox runner | $0.25 | $1.50 |
| `gemini-embedding-2` | Drill matching | tiny | n/a |

**Estimated tokens for one 22-minute mission** (rough; the live page replaces this):

| Step | Calls | Tokens (in / out) |
|---|---|---|
| Colleague replies | about 14 | 28,000 / 2,800 |
| Scenario weaver | 1 | 3,000 / 800 |
| Judge (two runs) | 2 | 12,000 / 4,000 |
| Sandbox runs (Software Engineer only) | 3 to 5 | 14,000 / 6,000 |

That is about **$0.03 to $0.05 per mission** and roughly **$0.08 to $0.14 per hour** of practice, with a safety margin up to $0.25 an hour if the model thinks longer than expected. Non-code roles skip the sandbox and cost less.

**Per learner**, assuming about 3 hours of practice in a semester: roughly **$0.25 to $0.75**, or about **₹20 to ₹65** at ₹88 to the dollar.

## 2. Everything else (infrastructure), per month at pilot scale

| Service | Estimate | Note |
|---|---|---|
| Cloud Run, one warm instance (1 vCPU, 512 MiB, min 1) | about $7 to $10 | Check Billing for the real figure |
| Firestore | $0 | Inside the free daily quota at this size |
| Secret Manager | under $1 | |
| Cloud Logging and Monitoring | $0 | Inside free allotments |
| BigQuery | $0 | Free tier is 1 TB of queries and 10 GB of storage a month; we write a few hundred bytes per mission |
| Cloud Build (each deploy) | $0 | Inside the free build minutes |
| Cloud Translation | $0 to small | Free monthly characters, then per million characters |
| Badge art (Vertex AI) | about $1 once | One image per skill, cached in Cloud Storage |
| **Total fixed cost** | **about $10 to $15 a month** | |

So the business is almost entirely a **variable AI cost** of cents per learner, plus a very small fixed cost. Infrastructure does not become expensive until tens of thousands of active learners, and Cloud Run scales by adding instances.

## 3. What you could charge (hypotheses to test in the pilot)

None of these are validated prices. They are starting points to put in front of a placement officer.

| Customer | Price idea | Our cost | Gross margin |
|---|---|---|---|
| College placement cell | ₹200 to ₹400 per student per semester | ₹20 to ₹65 | about 80 to 95 percent |
| Employer onboarding | ₹1,500 to ₹3,000 per new hire | about ₹30 to ₹100 for a role pack | above 95 percent |
| Individual learner | ₹99 to ₹199 a month (not our first focus) | ₹20 to ₹65 | about 50 to 90 percent |

Example sentence for the room: *"Practice costs us about [live number] an hour. A student who practises three hours costs us under ₹65. A college pays ₹200 to ₹400, so margin is high, and we expect to confirm the price in a pilot."*

## 4. What can go wrong with these numbers

1. **Free tier versus paid tier.** On Google's free Gemini tier, content may be used to improve Google's products. Paid tier does not do that. We run on a free key today. Before real students use it at scale, **turn on billing so the paid terms apply**. The cost stays tiny.
2. **Rate limits.** The free tier is rate limited, which is why there is a backup-key failover and a labelled scripted fallback. Paid tier raises limits.
3. **Model price changes.** Some larger Flash models double in price on 1 Jan 2027. Flash-Lite is unchanged today. Google also lists end dates for older models, so plan to move `gemini-3.1-flash-lite` to a newer Flash-Lite and re-measure.
4. **Thinking tokens.** If a model thinks longer, output tokens (billed at the output rate) go up. The live measurement includes them.
5. **Our own testing is in the totals.** The live page says so.

## 5. If asked "why BigQuery"

It stores an anonymous row per finished mission (role, skill, state, no names, no text). It lets a college ask "which skill is weakest across my batch" without ever touching individual learner data. At our scale it is inside the free tier. It is off the learner's critical path, so an outage would not stop a rehearsal. If it ever became costly, we would aggregate in Firestore instead.

## 6. The whole architecture, priced by scale (estimates, rupees at ₹88 to the dollar)

Assumes each learner practises about 3 hours in a semester, AI cost of ₹7 to ₹12 an hour (safety margin up to ₹22), and the infrastructure in section 2 growing as traffic grows. These are planning numbers, not quotes. Replace them with the live figures on `/traction` and the real Google Cloud bill as soon as there is data.

| Active learners in a semester | AI cost (3 h each) | Infrastructure for 6 months | Total cost | If a college pays ₹250 per student | Cost per learner |
|---|---|---|---|---|---|
| 100 (a pilot) | ₹2,100 to ₹3,600 (up to ₹6,500) | about ₹6,300 | about ₹8,400 to ₹12,800 | ₹25,000 | ₹84 to ₹128 |
| 1,000 | ₹21,000 to ₹36,000 (up to ₹65,000) | about ₹21,000 (a few warm instances, more Firestore) | about ₹42,000 to ₹86,000 | ₹2,50,000 | ₹42 to ₹86 |
| 10,000 | ₹2.1 to ₹3.6 lakh (up to ₹6.5 lakh) | about ₹1.6 lakh | about ₹3.7 to ₹8.1 lakh | ₹25,00,000 | ₹37 to ₹81 |

How to read it: the **fixed cost is small and shared**, so cost per learner falls as more people use it. At 100 learners the fixed part dominates; at 10,000 the AI part dominates.

**What is in the bill:** Cloud Run (the app), Firestore (data), Gemini (the colleagues, judge and sandbox), Secret Manager, logging, Cloud Translation for the other Indian languages, a little storage. **What is not in it:** people, marketing, payment fees, GST, support, and the human review that the nurse and banking packs still need from a clinician and a compliance professional. Say so if asked.

**Break-even on running costs:** about 30 paying students in a semester cover the fixed infrastructure (₹6,300 ÷ about ₹214 margin per student). Everything above that is margin, before the team's own costs.

## 7. Cost per hour of use, the sentence for the pitch

> "One hour of practice costs us about **₹7 to ₹12** in AI. We expect to charge about **₹80 an hour** (₹250 for a student's three hours). We have measured the cost, we have not yet validated the price."

Quote the measured figure from `/traction` instead of the range once about ten missions have run.

## 8. Ways to start earning (hypotheses to test, in this order)

| # | Model | Who pays | Idea | Why it fits |
|---|---|---|---|---|
| 1 | **Campus licence** | Placement cell or department | ₹150 to ₹400 per student per semester, minimum 100 students. Pilot first at a discount | One buyer, many learners, and the cohort view (anonymous patterns) is something they cannot build themselves. Cost to serve is under ₹65 |
| 2 | **Onboarding packs** | An employer, per new hire | ₹1,500 to ₹3,000 per hire for a role pack, plus a one-time setup fee for a custom pack (for example a bank's own procedures) | Higher price, same engine. The setup fee pays for the human who writes and reviews the pack |
| 3 | **Learner plan** | The learner | Free: one quick mission a month. **Plus**: ₹149 a month with a fair-use cap of about 8 hours | Worst case the cap costs ₹56 to ₹99 in AI, a typical learner costs ₹20 to ₹40. After 18% GST and about 2% gateway fees, ₹149 leaves about ₹123 |
| 4 | **Verified work sample** | The learner, later | The shareable evidence page and certificate stay free for everyone. A paid tier could add employer-facing portfolios | Free sharing is what spreads the product. Do not charge for the certificate itself |

Rules we are keeping: no leaderboards, no selling individual results to employers without the learner's consent, and the "practice, not a hiring score" label stays on every certificate.

**What to say if asked "have you validated any of this":** no. The AI cost is measured; the prices are hypotheses; the pilot with about 50 testers and the feedback form is how we start finding out. Ask them a pricing question in the form next time.

**Credits:** Google for Startups has a cloud programme that gives credits to eligible startups. Check eligibility before the pitch; credits would cover the fixed cost for a long time, but do not present them as revenue.
