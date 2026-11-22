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
