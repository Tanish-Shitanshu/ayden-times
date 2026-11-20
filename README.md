# Ayden: rehearse your first 90 days

**Status: MVP in progress.** Built for the Startup Buildathon India 2026 (Google DeepMind + Google Cloud), Delhi City Buildathon, by Team Ayden Times.

Ayden is a workplace rehearsal platform. A new graduate picks a role and works a realistic day with a **team of AI colleagues** (manager, reviewer, QA, buddy, a senior stakeholder). They produce **real work** (code, commit, pull request, SBAR escalation, case memo, client update). A deterministic engine plus a quote-verified judge turns that into a **Skill X-ray**: where they are lacking, which skill, with their own words as evidence, how their self-rating compares with what they showed, and what to practise next. Results are **private to the learner**. Colleges and employers see only anonymous group patterns (groups of 5+). No leaderboards.

> The model proposes. The engine decides. Every AI action is validated against state and knowledge boundaries and shown in a visible Engine Trace.

**Live:** https://ayden-app-388558128884.asia-south1.run.app (web app and API on one origin; `/api/v1/system/status` shows what is live).

## What is built

| Area | State |
|---|---|
| Roles | Software Engineer, Banking Ops, Nurse, Tech Consulting ready; Data Analyst planned |
| Engine | Turn-based world, beats, scripted events, knowledge boundaries, commitment detection, validated tools, idempotent actions |
| Agents | Gemini function-calling colleagues (when a model key is configured), scripted fallback otherwise, flagged in the UI |
| Code checks | Software Engineer code runs in **Google's code-execution sandbox**; never on our server |
| Scoring | Deterministic code signals first, quote-bound judge second (server verifies every quote), two judge runs, "uncertain" when they disagree |
| Learner data | Consent, export, delete; progress, Ramp Map, evidence-linked badges |
| Cohorts | Join codes, anonymous patterns with a minimum group size of 5 |
| Status | `GET /api/v1/system/status` reports which Google services are live, fallback or planned |

See [docs/BUILT_VS_PLANNED.md](docs/BUILT_VS_PLANNED.md) for the honest list.

## Run it

```bash
npm install
cp .env.example apps/api/.env.local     # then edit; never commit it
npm run dev:api                         # http://localhost:8080  (scripted mode needs no key)
npm test                                # unit + end-to-end tests
npm run build && npm start              # production bundle
BASE_URL=http://localhost:8080 npm run smoke
```

Live Gemini mode: set `LLM_MODE=live` and `GEMINI_API_KEY` in `apps/api/.env.local`, then run
`node --env-file=apps/api/.env.local scripts/smoke-gemini.mjs` to verify every model call Ayden uses.

Web app: `apps/web` (Vite + React). `npm run build` builds it and the API; `npm start` serves both on port 8080. See [docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md) for models, deploy and Windows notes.

## Layout

```
apps/api         Fastify + TypeScript API, engine, agents, role packs
apps/web         React web app (merged from the UI branch)
packages/contract  Shared API types (source of truth: packages/contract/src/index.ts)
docs/plan        Planning documents; docs/*.md architecture, security, integration
.agents/skills   Agent Skills used with Antigravity (engineering standards, role-pack authoring)
```

Docs: [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Integration for the web app](docs/INTEGRATION.md) · [Contributing](CONTRIBUTING.md)
