# Built vs planned (kept honest; `/api/v1/system/status` mirrors this)

## Built and tested
- Five role packs (Software Engineer, Banking Ops, Nurse, Consulting, Startup CEO decision-making), one engine, 30+ automated tests including injection and privacy tests
- Multi-agent colleagues with validated tool proposals, knowledge boundaries and a visible trace (live mode needs a model key; scripted fallback always works)
- Quote-bound judge with server-side quote verification and two-run disagreement handling (live mode); transparent rule-based fallback
- Real code execution in Google's sandbox for the Software Engineer mission (live mode); labelled static fallback
- Skill X-ray reports, confidence gap, drills, progress, Ramp Map, evidence-linked badges
- Consent, export, delete, cohort patterns with a minimum group size of 5
- Cloud Run + Firestore + Secret Manager + Cloud Logging deployment
- BigQuery anonymous skill-pattern rows and Sensitive Data Protection redaction before model calls (both on the request path; status page shows live counts)
- Spot the trap warm-up game (private, no leaderboard) with a daily challenge and achievements
- Ramp level, XP and daily quests derived from real evidence (private, no leaderboard); badge gallery with locked badges
- Vertex AI (Gemini image model) badge illustrations cached in Cloud Storage; Cloud Translation (Hindi) and Gemini speech (Listen) on colleague messages. Each is switched on by an env flag and hides itself when off
- Interface in 13 languages (English, Hindi and 11 more Indian languages): Hindi is hand-written; the rest are translated at runtime by Cloud Translation and cached in Cloud Storage and on the device. Mission content from the role packs stays English
- Cross-language colleague: Marco (Milan) speaks Italian; his messages are translated for the learner and the learner's messages reach him in Italian, both with Cloud Translation
- Cloud Monitoring uptime check and log-based metrics (model fallbacks, sandbox failures)

## Planned (not built)
- Data Analyst role with real BigQuery SQL
- Google sign-in
- ADK / Agent Runtime orchestration (agents currently use the Gemini Interactions API directly)
- Gemini Live voice (verbal SBAR), generated images, Lyria sound
- "Full day" mission mode; company-SOP Role Compiler; Gym API for AI agents; calibration against job performance
- Hindi mission content (UI chrome only in v1)
