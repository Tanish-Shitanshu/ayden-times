# Architecture

```
Browser (React SPA, built into apps/web/dist)
   │  same origin  /api/v1/*
   ▼
Cloud Run service "ayden-app"  (Node 22, Fastify, TypeScript)  ── serves SPA + API
   ├─ api/            routes, zod request validation, signed httpOnly guest cookie, rate limits
   ├─ domain/         engine (turn-based world, beats, triggers, idempotent actions), report builder, progress, privacy
   ├─ roles/          Role Packs: data + small pure functions (5 skills, anchors, beats, traps, artifacts, drills)
   ├─ agents/         Gemini adapter, colleague agents (function calling), judge, weaver, embeddings, sandbox runner
   ├─ infra/          Firestore store (prod) / in-memory store (tests, local), structured logging
   └─ Google: Gemini API · Cloud Run · Cloud Build · Artifact Registry · Firestore · Secret Manager · Cloud Logging
```

## The idea that makes it not an LLM wrapper

**The model proposes. The engine decides.**

1. Each colleague agent can act only through declared tools (`reply`, `commit_to`). Free text outside a tool is dropped.
2. The engine validates every proposal: tool allowed, length, character, and the **knowledge boundary** (a persona may not state a fact it does not know: `Fact.knownBy` + leak patterns).
3. Accepted proposals become events; rejected ones appear in the visible **Engine Trace** with the reason. A scripted line (flagged `fallback`) replaces a rejected or missing reply.
4. State (clock, beat, flags, files, artifacts, commitments) is written only by the engine.
5. Reviewer and QA lines are produced by engine rules (findings from the learner's real work); the model only restates them in each person's voice, and the engine keeps the reply only if every required fact survives.

## Scoring

1. **Deterministic code signals** over events, artifacts, flags and file diffs (for example: commit format regex, test count delta, hidden-check results from the sandbox, SBAR vitals match, numbers tie to data, no alert words to customers).
2. **Quote-bound judge** (Gemini, structured output) for the remaining soft anchors. The server verifies each quote is a verbatim substring of the learner's event; otherwise the anchor earns nothing.
3. The judge runs **twice**; disagreement marks the skill `uncertain` (never shown as a score).
4. If the model is unavailable, soft anchors use transparent keyword rules and the report says so.
5. Skill state = anchors met vs target; **confidence gap** compares onboarding self-rating with what was shown.

## Safe code execution

Software Engineer code never runs on our server. `run_checks` and the PR review send a single self-contained Python program (learner code + visible tests + hidden tests) to the **Gemini code-execution tool** (Google's sandbox) and parse the `AYDEN_RESULTS:` JSON line from the **sandbox output step**, not from model prose. If the sandbox is unavailable we fall back to labelled static checks. `SANDBOX=local-python` exists for tests and is refused in production.

## Data

Firestore collections: `users`, `sessions` (+ `events`, `trace` subcollections), `reports`, `cohorts`, `counters`. Only the API service account accesses them. Writes for a mission action are keyed by `clientSeq` for idempotency.

## Dynamic vs pre-built

Reliable core, dynamic surface. Pre-built: story skeleton, hidden truth, rubric, checks. Dynamic: Scenario Weaver (Gemini structured output personalises the opening and scene detail), free-text colleague replies, adaptive drill choice (embeddings), "New variant".
