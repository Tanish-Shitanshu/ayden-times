# Security

| Control | Implementation | State |
|---|---|---|
| Secrets | Session secret from Secret Manager; model key goes to Secret Manager and is mounted at runtime; no keys in repo or image | built |
| Least privilege | Dedicated service account `ayden-run`: Firestore user, Secret accessor, Logging writer | built |
| Untrusted input | learner text in delimited fields; replies only via validated tools; ten injection tests; zod validation on every request | built |
| Code execution | learner code only in Google's sandbox, never on our host; local runner refused in production | built |
| Consent | 18+ and "store my work" required before any mission; optional sharing of anonymous patterns | built |
| Data rights | `GET /me/export`, `DELETE /me` remove everything for a user (sessions, events, traces, reports, owned cohorts) | built |
| Privacy tiers | learner owns the report; cohort owners get only aggregates for groups of 5 or more; no per-person scores to anyone; no leaderboards | built |
| Rate limits | per-user action limit, mission creation limit, guest-session limit per network | built |
| Logging | structured Cloud Logging: model, latency, verdicts. Never prompts, user text or keys | built |
| Auth | signed httpOnly SameSite cookie guest sessions; Google sign-in planned | built / planned |
| Headers | nosniff, no-referrer, frame deny, restrictive permissions policy, no-store on API | built |
| PII redaction | Sensitive Data Protection planned; today learners are told not to enter personal data | planned |

Known limits: guest sessions are not real authentication; scores are formative and not validated against job performance; nurse and banking scenarios are simplified, fictional and not reviewed by a clinician or compliance professional.
