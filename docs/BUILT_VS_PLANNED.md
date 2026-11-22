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

- Startup CEO decision-making role (22 Nov): hiring decision with real runway numbers, a security incident, an investor who asks to hide it, a customer demanding a date, and an honest board update. Five skills, five drills, three variants, tested end to end in live mode
- Tester feedback (stars, 0 to 10 recommend, comment, optional photo resized on the device) and a public, aggregate-only `/traction` page. A tester appears only if they ticked the box. Counters on it come from the database; nothing is hard-coded
- Measured AI cost per mission and per hour, counted from Gemini's reported token usage at published paid-tier prices (shown on `/traction`)
- Gemini key failover: `GEMINI_API_KEY_BACKUP` and `GEMINI_API_KEY_BACKUP_2` take over on quota or key errors (the backup is only used if set)
- Completion sounds (synthesised in the browser; an optional recorded file in `public/sounds/` overrides them) with an on/off switch

## Planned (not built)
- Data Analyst role with real BigQuery SQL
- Google sign-in
- ADK / Agent Runtime orchestration (agents currently use the Gemini Interactions API directly)
- Gemini Live voice (verbal SBAR), Lyria-generated sound files (the synthesised chime is built; a Lyria clip can replace it)
- "Full day" mission mode; company-SOP Role Compiler; Gym API for AI agents; calibration against job performance
- Hindi mission content (UI chrome only in v1)
