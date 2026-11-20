# 02 · API Contract v1.0 (frontend ⇄ backend)

**Read with `contract.ts` (same folder).** `contract.ts` is the single source of truth for every JSON shape. This document explains behaviour: endpoints, order of calls, polling, errors, and gives complete example payloads so the frontend can build against fixtures on day zero and flip to the real server with one flag.

**Owner of this contract: Tanish's Claude (backend).** Frontend may not change it. If the UI needs a field: append a line to `CONTRACT_CHANGES.md` (date, field, why) and tell Tanish; backend answers within the hour.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1`. Same origin as the web app in production (one Cloud Run service serves the built web app and the API). In dev, Vite proxies `/api` → `http://localhost:8080`. |
| Auth | Guest session cookie `ayden_sid` (httpOnly, SameSite=Lax, Secure in production). Created by `POST /session/guest`. Frontend uses `fetch(url, { credentials: "include" })`. Google sign-in is a later add-on; it will not change any shape. |
| Format | JSON only. `Content-Type: application/json`. Dates are ISO-8601 UTC strings. |
| Errors | Non-2xx → body `ApiError` (see `contract.ts`). Always show `error.message` to the user in a snackbar or inline; never show raw JSON. `rate_limited` includes `retryAfterMs`. |
| Idempotency | Every `POST /missions/:id/act` carries `clientSeq` (an integer the client increments per mission, starting at 1). Replaying the same `clientSeq` returns the original response and does nothing twice. Retry on network failure with the same `clientSeq`. |
| Hidden truth | The server never sends answers, ground-truth numbers or hidden check names until `status === "done"`. Do not try to infer them client-side. |
| Slow models | `act` waits up to ~12 s for agent replies. If some are still being generated, the response has `pending: true`. Then poll `GET /missions/:id/events?since=<lastSeq>` every 1500 ms until `pending: false`. Show a typing indicator for the person you last messaged (the client infers typing from `pending: true`; there are no "is typing" events). |
| Fallbacks | `MissionState.runtime.mode` is `live`, `scripted` or `cached`. If not `live`, show a visible but calm banner: "Running in offline script mode (the AI model is unavailable)." Events produced by fallback have `fallback: true`; show a small "scripted" tag on them. Never hide fallbacks. |
| Language | `Accept-Language` is ignored. UI chrome language is a client concern (`en`/`hi`). Mission content is English in v1. |
| Rate limits | 60 requests/min per session on `act`, 10 mission creations/hour. On `429` show `retryAfterMs`. |

---

## 2. Endpoints

All paths are under `/api/v1`. **Auth** column: G = guest cookie required.

| # | Method & path | Auth | Request body | Response | Notes |
|---|---|---|---|---|---|
| 1 | `POST /session/guest` | – | `{}` | `CreateGuestResponse` | Creates a guest user and sets the cookie. Call on first visit to `/demo`, `/roles`, or any protected route if `GET /me` returns 401. |
| 2 | `GET /me` | G | – | `Me` | 401 `unauthenticated` if no cookie. |
| 3 | `PATCH /me` | G | `UpdateMeRequest` | `Me` | Display name, UI language. |
| 4 | `PUT /me/consent` | G | `UpdateConsentRequest` | `Me` | Must have `age18 && storeWork` true before any mission (`consent_required` otherwise). Can be changed later in the Privacy Centre. |
| 5 | `GET /me/export` | G | – | `ExportResponse` | Download as `ayden-export.json`. |
| 6 | `DELETE /me` | G | – | `DeleteMeResponse` | Deletes everything for this user, clears cookie. |
| 7 | `GET /roles` | – | – | `RoleSummary[]` | Five roles. `status: "planned"` ones render as non-clickable "Planned" cards. |
| 8 | `GET /roles/:roleId` | optional | – | `RoleDetail` | If a session exists, `rampMap` states are personalised. |
| 9 | `POST /onboarding` | G | `Onboarding` minus `completedAt` | `Me` | Saves experience + self-ratings (one per role). |
| 10 | `POST /missions` | G | `CreateMissionRequest` | `MissionState` | Creates a session. Requires consent + onboarding for that role. Errors: `consent_required`, `validation`, `attempt_cap`, `rate_limited`. `reseed: true` → new variant. |
| 11 | `GET /missions/:id` | G | – | `MissionState` | Full snapshot (use on page load / refresh). |
| 12 | `GET /missions/:id/events?since=<seq>` | G | – | `EventsResponse` | `since=0` returns everything. Used for reload and for polling when `pending`. |
| 13 | `POST /missions/:id/act` | G | `ActRequest` | `ActResponse` | The only mutation inside a mission. See §3. |
| 14 | `POST /missions/:id/finish` | G | `{}` | `{ reportId: string; status: "processing" \| "ready" }` | Same as `act {kind:"finish"}`; use whichever is simpler. Judging takes 5-25 s. |
| 15 | `GET /reports/:id` | G | – | `Report` | `status: "processing"` → poll every 2000 ms (max 60 s) with a friendly "Reading your work…" screen. |
| 16 | `GET /missions/:id/transcript` | G | – | `EventsResponse` | Only when `status === "done"`; includes hidden-check names and all events. Used by the debrief's "View in conversation". |
| 17 | `GET /me/progress?roleId=<id>` | G | – | `Progress` | Ramp Map, skill history, badges, next best drill. |
| 18 | `GET /me/drills?roleId=<id>` | G | – | `DrillList` | Recommended drills from the latest report. |
| 19 | `POST /cohorts` | G | `CreateCohortRequest` | `Cohort` | Creates a cohort; caller is owner. |
| 20 | `POST /cohorts/join` | G | `JoinCohortRequest` | `Cohort` | Join by code (also from `/join/:code` link). |
| 21 | `GET /cohorts` | G | – | `Cohort[]` | Cohorts I own or belong to. |
| 22 | `GET /cohorts/:id/insights` | G (owner) | – | `CohortInsights` | k ≥ 5 enforced server-side; if suppressed the UI shows the explanation, never numbers. |
| 23 | `GET /system/status` | – | – | `SystemStatus` | Powers the `/how-it-works` page: models in use, Google services with honest `live/fallback/planned`, counters. |
| 24 | `GET /health` | – | – | `{ ok: true }` | |

---

## 3. How a mission plays (call order)

```
GET  /roles                         → landing + role grid
GET  /roles/:id                     → role page
POST /session/guest                 → if no cookie
PUT  /me/consent                    → consent checkbox card (first time only)
POST /onboarding                    → experience + self-rating sliders
POST /missions {roleId,mode}        → MissionState  → navigate to /mission/:id
GET  /missions/:id/events?since=0   → initial transcript (usually the scripted opening events)
loop:
  POST /missions/:id/act {clientSeq, kind:"message"|"open_item"|"save_file"|"run_checks"|"submit_artifact"|"advance"}
    → ActResponse {events, delta, pending, trace}
  if pending: poll GET events?since=lastSeq until pending=false
POST /missions/:id/finish           → {reportId}
GET  /reports/:id (poll)            → Report  → /mission/:id/debrief
GET  /me/progress                   → /progress
POST /missions {drillId}            → drill session (same workspace screen)
```

### `act` kinds

| kind | When the UI sends it | Server effect |
|---|---|---|
| `message` | Learner sends chat/email text to a person | Appends learner event; engine routes to that person's agent; replies come back as events (maybe `pending`). Also feeds signals (e.g. "asked a clarifying question"). |
| `open_item` | Learner opens a file/doc/ticket/record | Logged (signals like "read the contributing guide before coding"). Returns no events normally. Cheap; send it, do not await UI on it. |
| `save_file` | Autosave of editor content (debounce 1500 ms) and before `run_checks` | Stores draft. No agent replies. |
| `run_checks` | "Run checks" button | Runs visible + hidden checks. Result arrives as a `check_result` event with `meta.checks`. May be `pending` (sandbox can take up to ~20 s). |
| `submit_artifact` | Commit message / PR description / SBAR / memo / email / SQL submitted | Stores artifact, runs deterministic checks, triggers reviewer/tester/manager agents in parallel. |
| `advance` | "Continue to next beat" when `canAdvance` is true | Engine moves the story forward; may fire scripted events and consequences. |
| `finish` | "Finish and see my report" when `canFinish` is true | Starts judging; returns report id. |

`canAdvance` / `canFinish` come from the server. **Disable the buttons when false and show why** (tooltip / helper text from `beat.objective`).

---

## 4. Example payloads (use these as mock fixtures)

### 4.1 `GET /roles` (abridged)

```json
[
  {
    "id": "software-engineer",
    "title": "Software Engineer (Graduate / Intern)",
    "tagline": "Your first pull request, reviewed by a real team.",
    "domain": "Technology",
    "status": "ready",
    "company": "Meridian Labs",
    "estMinutes": 25,
    "skillCount": 5,
    "icon": "terminal",
    "accentHex": "#1a73e8"
  },
  {
    "id": "nurse",
    "title": "Staff Nurse (Ward)",
    "tagline": "A night-shift handover where the details matter.",
    "domain": "Healthcare",
    "status": "ready",
    "company": "St. Anne's General Hospital (fictional)",
    "estMinutes": 20,
    "skillCount": 5,
    "icon": "stethoscope",
    "accentHex": "#1e8e3e"
  }
]
```

### 4.2 `POST /missions` → `MissionState` (software engineer, abridged)

```json
{
  "id": "m_8f2k1",
  "roleId": "software-engineer",
  "missionId": "swe-day3-bugfix",
  "kind": "mission",
  "title": "Day 3 at Meridian Labs: fix the double-discount bug",
  "company": "Meridian Labs",
  "status": "active",
  "beat": { "index": 0, "total": 4, "title": "Beat 1 of 4 · Understand the ticket", "objective": "Read the ticket and the team guide. Ask whatever you need before you touch the code." },
  "clock": { "minute": 0, "label": "Wed 09:30", "minutesTotal": 480 },
  "people": [
    { "id": "priya", "name": "Priya Nair", "title": "Engineering Manager", "kind": "agent", "avatarHue": 210, "presence": "online", "modelLabel": "Gemini 4 Hydrogen" },
    { "id": "arjun", "name": "Arjun Rao", "title": "Senior Engineer (reviewer)", "kind": "agent", "avatarHue": 140, "presence": "busy", "modelLabel": "Gemini 4 Hydrogen" },
    { "id": "neha", "name": "Neha Shah", "title": "QA Engineer", "kind": "agent", "avatarHue": 30, "presence": "online", "modelLabel": "Gemini 4 Hydrogen + code execution" },
    { "id": "rohan", "name": "Rohan Mehta", "title": "Buddy (engineer, 1 year in)", "kind": "agent", "avatarHue": 280, "presence": "online", "modelLabel": "Gemini 4 Hydrogen" }
  ],
  "items": [
    { "id": "it_ticket", "type": "ticket", "title": "INV-142 · Discount applied twice on bulk orders", "key": "INV-142", "status": "To do", "priority": "high", "description": "Customers report that bulk orders get the volume discount twice. See pricing.py." },
    { "id": "it_guide", "type": "doc", "title": "CONTRIBUTING.md", "markdown": "# How we work\n- Branch from `main`...\n" },
    { "id": "it_pricing", "type": "file", "title": "pricing.py", "path": "src/pricing.py", "language": "python", "content": "def total(items, discount_rate):\n    ...", "editable": true },
    { "id": "it_tests", "type": "file", "title": "test_pricing.py", "path": "tests/test_pricing.py", "language": "python", "content": "def test_total_simple():\n    ...", "editable": true }
  ],
  "artifacts": [
    { "id": "ar_commit", "kind": "commit_message", "title": "Commit message", "instructions": "Write the commit message you would push. Follow the team guide.", "required": true, "maxChars": 400, "submitted": false },
    { "id": "ar_pr", "kind": "pr_description", "title": "Pull request description", "instructions": "Explain the change so a reviewer can approve it in five minutes.", "template": "## Why\n\n## What changed\n\n## How I tested\n\n## Risks\n", "required": true, "maxChars": 2000, "submitted": false }
  ],
  "attempt": { "number": 1, "max": 2 },
  "runtime": { "mode": "live", "agentModels": [ { "personId": "priya", "model": "gemini-4-hydrogen" }, { "personId": "judge", "model": "gemini-4-argon" } ] },
  "seed": "K7F2",
  "variantLabel": "Variant K7F2 · bulk-order pricing",
  "startedAt": "2026-11-20T16:05:00Z",
  "lastSeq": 3,
  "canAdvance": false,
  "canFinish": false
}
```

### 4.3 Events

```json
{
  "events": [
    { "seq": 1, "at": "2026-11-20T16:05:01Z", "simMinute": 0, "kind": "message", "channel": "chat", "from": "priya", "to": "you", "source": "script",
      "body": "Morning! Welcome to day 3. I've put **INV-142** on your board. Customers are getting a double discount. Can you take it? Release is Friday." ,
      "meta": { "quickReplies": ["Yes, I'll start now", "Can I ask a few questions first?"] } },
    { "seq": 2, "at": "2026-11-20T16:05:20Z", "simMinute": 3, "kind": "message", "channel": "chat", "from": "you", "to": "priya", "source": "learner",
      "body": "Before I start: does the discount apply per line item or to the whole order?" },
    { "seq": 3, "at": "2026-11-20T16:05:27Z", "simMinute": 4, "kind": "message", "channel": "chat", "from": "priya", "to": "you", "source": "agent",
      "body": "Good question. Whole order, once. Details are in the guide. Ask Rohan if the codebase confuses you." }
  ],
  "delta": { "beat": { "index": 0, "total": 4, "title": "Beat 1 of 4 · Understand the ticket", "objective": "Read the ticket and the team guide." }, "clock": { "minute": 4, "label": "Wed 09:34", "minutesTotal": 480 }, "status": "active", "lastSeq": 3, "canAdvance": true, "canFinish": false, "attempt": { "number": 1, "max": 2 }, "artifacts": [] },
  "pending": false,
  "trace": [
    { "id": "t1", "seq": 3, "at": "2026-11-20T16:05:27Z", "actor": "Priya (Gemini 4 Hydrogen)", "model": "gemini-4-hydrogen", "type": "proposal", "summary": "Proposed tool reply(chat, \"Good question. Whole order, once…\")", "verdict": "accepted", "latencyMs": 2140 },
    { "id": "t2", "seq": 2, "at": "2026-11-20T16:05:20Z", "actor": "Engine", "type": "signal", "summary": "Signal asked_clarifying_question_before_edit = true", "verdict": "accepted" }
  ]
}
```

### 4.4 A review comment and a check result

```json
{ "seq": 17, "kind": "review_comment", "channel": "review", "from": "arjun", "source": "agent", "simMinute": 212, "at": "2026-11-20T16:21:00Z",
  "body": "This fixes the bug, thanks. Could you add a test for quantity = 0? Otherwise the edge case may regress.",
  "meta": { "commentFile": "src/pricing.py", "commentLine": 14, "severity": "blocker" } }

{ "seq": 12, "kind": "check_result", "channel": "checks", "from": "system", "source": "engine", "simMinute": 150, "at": "2026-11-20T16:17:00Z",
  "body": "Ran 6 checks in a Google-hosted sandbox: 5 passed, 1 failed.",
  "meta": { "checks": [
    { "id": "c1", "name": "test_total_simple", "kind": "test", "passed": true, "hidden": false },
    { "id": "c5", "name": "Hidden check 1", "kind": "test", "passed": false, "hidden": true, "message": "A hidden check failed. Think about unusual inputs." }
  ] } }
```

### 4.5 `GET /reports/:id` (abridged but complete shape)

```json
{
  "id": "r_41ab", "missionId": "m_8f2k1", "roleId": "software-engineer", "createdAt": "2026-11-20T16:40:00Z", "status": "ready",
  "headline": "You verify your work. Next: write commits a teammate can follow.",
  "summary": "You asked a good clarifying question before coding and ran the checks twice. Your commit message did not say why the change was needed, and one reviewer comment was answered without a test.",
  "skills": [
    {
      "skillId": "git_hygiene", "label": "Commits and pull requests teammates can follow",
      "selfRating": 4, "anchorsMet": 1, "anchorsTotal": 4, "target": 3, "state": "gap", "confidenceGap": "overestimated",
      "signals": [
        { "id": "commit_conventional", "anchor": "Commit subject follows type(scope): summary", "met": false, "source": "code", "eventSeq": 14 },
        { "id": "pr_has_why", "anchor": "PR description explains why, not only what", "met": true, "source": "judge", "eventSeq": 15 }
      ],
      "evidence": [
        { "eventSeq": 14, "quote": "fixed discount", "note": "Subject does not say what changed or reference INV-142.", "tone": "miss", "verifiedBySystem": true }
      ],
      "missedFact": "The team guide asks for the ticket key in every commit subject."
    }
  ],
  "keyMoments": [ { "eventSeq": 2, "quote": "does the discount apply per line item or to the whole order?", "why": "A precise question that removed the main ambiguity.", "skillId": "clarify" } ],
  "consequences": [ { "eventSeq": 21, "title": "Your skipped edge-case test came back", "detail": "QA found that quantity = 0 returns a negative total in the demo build." } ],
  "nextSteps": [ { "drillId": "swe-drill-commit-hygiene-b", "skillId": "git_hygiene", "title": "Write a commit and PR for a different bug", "why": "Your commit subject at message 14 was 'fixed discount'.", "estMinutes": 8, "scaffold": "hinted" } ],
  "integrity": { "judgeModel": "gemini-4-argon", "mode": "live", "quotesVerified": 9, "quotesRejected": 1, "uncertainSkills": [], "notes": ["Scores are formative practice feedback. They are not validated against job performance."] },
  "privacyNote": "Only you can see this report.",
  "shareSummary": "I rehearsed a software engineering first week on Ayden. Strength: verifying my work. Working on: commit and PR hygiene."
}
```

### 4.6 `GET /system/status`

```json
{
  "version": "0.1.0-mvp", "commit": "a1b2c3d", "region": "asia-south1", "runtime": "live",
  "models": [
    { "role": "Colleague agents", "id": "gemini-4-hydrogen", "purpose": "Manager, reviewer, QA, buddy replies via function calling" },
    { "role": "Judge + Director", "id": "gemini-4-argon", "purpose": "Quote-bound judging, scenario weaving" },
    { "role": "Drill matching", "id": "gemini-embedding-2", "purpose": "Match gaps to drills" }
  ],
  "googleServices": [
    { "name": "Cloud Run", "state": "live", "detail": "Stateless container, scales to zero between cohorts" },
    { "name": "Firestore", "state": "live", "detail": "Sessions, events, reports" },
    { "name": "Secret Manager", "state": "live", "detail": "Model API key mounted at runtime" },
    { "name": "Gemini code execution", "state": "live", "detail": "Runs learner code in Google's sandbox" },
    { "name": "BigQuery", "state": "planned", "detail": "Analytics export for cohort console" }
  ],
  "counters": { "missionsStarted": 31, "missionsCompleted": 18, "modelCalls": 412, "fallbacks": 3, "quotesVerified": 96, "quotesRejected": 7 }
}
```

(The numbers above are placeholders. The real endpoint returns real counters, never seeded ones.)

---

## 5. Frontend mock mode (so the UI never waits for the backend)

* `VITE_API_MODE=mock | live` (default **live**). The API client `src/api/client.ts` exposes one function per endpoint above with the exact types from `contract.ts`. In `mock` mode the same functions return fixtures from `src/api/mock/*` (use the payloads in §4 as a starting point; write at least one complete mission for **every** role so every screen can be seen).
* Mock mode must simulate: latency (400–1500 ms), `pending: true` then a later event, an `attempt_cap` error, a `consent_required` error, a fallback banner, a `processing` report that turns `ready` after 3 polls.
* The switch to live is **only** an environment variable. If switching requires code changes, the mock layer is wrong.
* A dev-only floating "Mock panel" (hidden in production builds) lets you force: slow model, fallback mode, error codes. This is how you test states.

## 6. Backend guarantees the frontend can rely on

1. `events` are returned ordered by `seq`, no gaps within a response chain, never duplicated.
2. `MissionState.lastSeq` equals the highest `seq` in the transcript at snapshot time.
3. `delta.canAdvance`/`canFinish` are authoritative.
4. A `Report` always contains all of the role's `SkillDef`s (a skill with no evidence has `state: "uncertain"`).
5. Every `Evidence.quote` is a substring of the event body at `eventSeq` (server verified).
6. No endpoint returns a user's data to a different user. Cohort owners only ever receive `CohortInsights`.
7. Responses are stable across a refresh (state lives server-side, not in the browser).

## 7. Contract change log

`CONTRACT_CHANGES.md` (create in repo root). Format: `YYYY-MM-DD HH:MM · requested by · change · status`. Backend merges accepted changes into `contract.ts` and posts the new version number at the top of this file.
