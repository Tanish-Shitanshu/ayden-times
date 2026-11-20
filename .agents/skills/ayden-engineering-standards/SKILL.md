---
name: ayden-engineering-standards
description: Engineering rules for the Ayden codebase. Use when writing or reviewing code, tests, commits or pull requests in this repository, or when adding anything that calls a model.
---

# Ayden engineering standards

1. BDD first: add or update a scenario in `apps/api/features/*.feature`, then a vitest test, then the code.
2. Domain modules (`roles/`, `domain/text.ts`, `privacy.ts`, `progress.ts`) import no I/O. Model calls live in `agents/`, storage in `infra/`.
3. Every model output is validated: tool proposals through `validateReply`, judge quotes verified verbatim, structured output checked for shape and length.
4. Learner text is untrusted: pass it in delimited fields; never give personas facts they do not know.
5. Never run learner code on the server. Use Google's code-execution sandbox; in tests use the local-python runner only.
6. Conventional Commits: `type(scope): summary` (72 chars). Tests with every fix.
7. No secrets in code, logs or commits. No `console.log` (use `infra/log.ts`).
8. A Google service is marked `live` in `/system/status` only if it is on the request path.
