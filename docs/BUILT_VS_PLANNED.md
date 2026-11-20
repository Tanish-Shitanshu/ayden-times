# Built vs planned (kept honest; `/api/v1/system/status` mirrors this)

## Built and tested
- Four role packs (Software Engineer, Banking Ops, Nurse, Tech Consulting), one engine, 30+ automated tests including injection and privacy tests
- Multi-agent colleagues with validated tool proposals, knowledge boundaries and a visible trace (live mode needs a model key; scripted fallback always works)
- Quote-bound judge with server-side quote verification and two-run disagreement handling (live mode); transparent rule-based fallback
- Real code execution in Google's sandbox for the Software Engineer mission (live mode); labelled static fallback
- Skill X-ray reports, confidence gap, drills, progress, Ramp Map, evidence-linked badges
- Consent, export, delete, cohort patterns with a minimum group size of 5
- Cloud Run + Firestore + Secret Manager + Cloud Logging deployment
- BigQuery anonymous skill-pattern rows and Sensitive Data Protection redaction before model calls (both on the request path; status page shows live counts)
- Spot the trap warm-up game (private, no leaderboard)

## Planned (not built)
- Data Analyst role with real BigQuery SQL
- Google sign-in
- ADK / Agent Runtime orchestration (agents currently use the Gemini Interactions API directly)
- Gemini Live voice (verbal SBAR), generated images, Lyria sound
- "Full day" mission mode; company-SOP Role Compiler; Gym API for AI agents; calibration against job performance
- Hindi mission content (UI chrome only in v1)
