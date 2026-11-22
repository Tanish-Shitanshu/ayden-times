# Four roles for the regional round (22 Nov 2026)

Shown roles: **Software Engineer** (2 missions), **Junior Financial Analyst**, **Procurement Trainee**, **Consulting and Advisory Analyst** (2 missions, role id `tech-consulting`).
Hidden (kept in code, reachable by id, not listed): Digital Marketing Associate, Nurse, Startup CEO, Banking Operations, Data Analyst.

## The answer to "where does the data come from?"
1. **Rules come from a public standard we can name.** Google Cloud's ADR guidance, "choose compute options" and "database options" pages, the Well-Architected Framework; standard FP&A practice (variance analysis, one-offs, contingency); total cost of ownership and weighted bid scoring from public procurement guidance; Google Ads metric definitions and text limits.
2. **Numbers are synthetic.** The engine generates them from the session seed, in the format of the real tool's export. No real company data.
3. **The engine checks the work, not the AI.** Totals, rankings, allocations, character limits and claim words are checked by code. Gemini only plays the colleagues and a quote-bound judge reads the prose.

## What each role tests
| Role | Real decision | Hard checks (engine) | Traps |
|---|---|---|---|
| Software Engineer, mission 2 `swe-tech-decisions` | Data store, hosting, scale and cost, and what to do when evidence changes | Store fits the data (per variant), instances and monthly cost tie to given numbers, record has five parts, summary answer-first and short | Fashion pushed by a senior or a buddy; always-on cluster for a five-person team; Bigtable for 400 writes/s |
| Junior Financial Analyst `fin-budget-split` | Where did the budget go, and who gets the rest | Variance and % per line, flags above 10%, allocation ordered by profit per rupee, must-pay funded, contingency kept, memo under 120 words | One-off launch event, invoice booked twice, revenue vs profit, request to raid the contingency |
| Procurement Trainee `proc-vendor-award` | Which vendor, at what price | Total cost per vendor, winner chosen, price inside the vendor's hidden floor, memo ties to data | Sticker price, a vendor with 60% on-time, a gift hamper, "just pick the cheapest" |
| Consulting and Advisory Analyst, mission 1 `cons-margin-review` (strategy) | Why did margin fall, and what should the client do | Margin bridge (last year, mix, rate, this year) ties to the data, rupee impact within tolerance, answer-first summary under 150 words, recommendation present | CFO jumps to supplier prices, finance and ops revenue disagree by 2%, out-of-scope staffing request |
| Consulting and Advisory Analyst, mission 2 `cons-controls-review` (advisory) | Does a payment control work, and what do you report | Every exception in a 30-payment sample found with the right type, rating follows the stated rule, amounts tie, finding has observation / risk / recommendation and says it is a sample | Controller wants a duplicate relabelled Low; a friendly client junior asks for the draft |
| (hidden) Digital Marketing Associate `mkt-campaign-review` | Read a campaign report, move budget, write an ad | CTR/CPC/CVR/CPA/ROAS per campaign, budget inside the limit with 10% test, ranked by ROAS, brand search capped, 30/90-character limits, no guarantee or cure claims | Zero conversions from a removed tag, flattering brand-search ROAS, a client demanding "guaranteed to cure acne" |

## Excel and PDF
- **Excel in:** every `table` work item has "Download .xlsx" (built in the browser).
- **Excel out:** artifacts of kind `spreadsheet` accept an uploaded `.xlsx`. It is read **in the browser** and sent as text (`Cell | Cell | Cell`). The server never receives the file. `.xlsm` and files over 2 MB are rejected. Values are read as cached numbers; formulas are not evaluated.
- **PDF in:** every `doc` work item has "Download PDF".
- **PDF out:** memos and emails have "Export PDF" (built in the browser). Scoring reads the text the learner wrote.
- Not built: uploading a PDF and reading it back.

## Admin
`/admin` lists all feedback and can **remove** (never add or edit) a response. Needs `ADMIN_TOKEN` (16+ characters) set on the server; unset means the routes return 404. Put it in Secret Manager before deploying.

## Google services in the product (say only what is true)
Live: Gemini API (function calling for the colleagues, structured output for the judge, embeddings for drill matching, code execution for the Software Engineer sandbox, speech for "Listen"), Vertex AI image (badge art), Cloud Translation (a colleague who speaks another language, and 13 interface languages), Sensitive Data Protection (redaction), Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager, Cloud Logging, BigQuery (anonymous skill patterns).
Not added this round: no new Google service. Excel and PDF are built in the browser. Looker Studio on BigQuery is a free option (see SETUP_STEPS.md); do not claim it until built.

## Done in the review round
Standup in the Software Engineer bug-fix mission; the AI circuit breaker now opens only after four failures in a row and for 20 seconds (it was 3 and 60), so a burst of rate limits does not send everyone to the scripted fallback; the role tests can run against a deployed URL (`npm -w @ayden/api run test:live` with `AYDEN_BASE_URL`); `scripts/deploy-and-verify.sh`.

## Not done yet
A spoken welcome from a character; a "most-missed skills" panel on `/traction`; the Lyria completion sound; Google sign-in for the admin page (a token is used instead); a practitioner review of the Finance, Procurement and Consulting scripts; **a live-Gemini run of the new roles** (run `scripts/deploy-and-verify.sh`; the key on the dev laptop is out of credits). All 84 automated tests ran in scripted mode.
