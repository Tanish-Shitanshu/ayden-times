# Ayden backend: integration notes for the web app (v0.1, live)

**Live API:** `https://ayden-app-388558128884.asia-south1.run.app/api/v1`  (health: `/api/v1/health`, status: `/api/v1/system/status`)

Right now the AI colleagues run in **scripted mode** (`runtime.mode = "scripted"`) until Tanish adds the model key. Everything else is real: Firestore storage, the engine, code checks (static fallback until the key), scoring, reports, progress, cohorts. When the key is added the same URL switches to `live` with no frontend change.

## 1. Dev proxy (so cookies work on http://localhost)

```ts
// vite.config.ts
import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "https://ayden-app-388558128884.asia-south1.run.app",
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: "localhost",
        configure: (proxy) => {
          // Cloud Run sets Secure cookies; strip it so http://localhost accepts them in every browser.
          proxy.on("proxyRes", (res) => {
            const c = res.headers["set-cookie"];
            if (c) res.headers["set-cookie"] = c.map((x) => x.replace(/;\s*Secure/i, ""));
          });
        },
      },
    },
  },
});
```
Use `fetch("/api/v1/...", { credentials: "include" })`. In production the web app and API share one origin, so no proxy is needed.

## 2. Differences from `02_API_CONTRACT.md`

| Topic | Real behaviour |
|---|---|
| `pending` | Always `false`. The server waits for agent replies (up to about 25 s) and returns them in the same response. Polling `GET /missions/:id/events?since=` still works if you want it. |
| `act {kind:"finish"}` | Works, returns the normal `ActResponse` plus an extra `reportId`. `POST /missions/:id/finish` returns `{reportId, status:"ready"}` after judging (can take up to about 45 s in live mode). The report is ready when it returns; `GET /reports/:id` works immediately. |
| `reason`/`rejectedReason` | `act` returns HTTP 200 with `accepted:false` and `rejectedReason` for soft rejections (e.g. `advance` before the objective is met). Hard errors are the standard `ApiError`. |
| Idempotency | Same `clientSeq` returns the stored response; start at 1 and increment. |
| Planned role | `data-analyst` has `status:"planned"`; `POST /missions` for it returns 404 `not_found`. `GET /roles/data-analyst` works but has empty skills. |
| Attempts | Starting the same mission variant a third time returns 409 `attempt_cap`. Pass `reseed:true` ("New variant") to get a different variant and never be blocked. |
| Time cost | `check_result` after `run_checks` can take up to about 25 s in live mode. Show "Running in a Google-hosted sandbox…". In scripted mode it returns instantly and the body says "Static checks (the sandbox was unavailable)". |
| `trace` | Every `act` response and `GET .../events` includes `trace[]` (the Engine Trace). Entries from rejected model proposals have `verdict:"rejected"` and a `reason`. |

## 3. Ids you can rely on (use for mock fidelity only; the UI must still render whatever the API returns)

| Role id | Mission id | People ids | Item ids | Artifact ids | Skill ids |
|---|---|---|---|---|---|
| `software-engineer` | `swe-day3-bugfix` | priya, arjun, neha, rohan, meera | it_ticket, it_guide, it_readme, it_src (editable python), it_tests (editable python) | ar_commit (commit_message), ar_pr (pr_description) | clarify, verify, conventions, git_hygiene, review_collab |
| `banking-ops` | `bank-desk-morning` | karan, ananya, vikram, caller | it_policy, it_queue (table), it_case_hit (record), it_case_self (record) | ar_escalation (email), ar_memo (memo) | prioritise_queue, maker_checker, escalate_hold, no_tipping_off, document_rationale |
| `nurse` | `nurse-night-handover` | meera_t, khan, lakshmi, relative | it_policy, it_handover (table), it_bed (record, **changes mid-mission**), it_bed8 (record) | ar_sbar (sbar), ar_note (text) | prioritise, escalate_sbar, scope_safety, privacy, document |
| `tech-consulting` | `cons-margin-review` | rhea, imran, sethi, partner | it_scope, it_margin (table), it_supplier (table), it_recon (table), it_email | ar_tree (text), ar_update (email) | structure, answer_first, numbers_integrity, scope_mgmt, stakeholder_comm |
| `data-analyst` | (planned) | | | | |

Drills (start with `POST /missions {roleId, drillId, mode:"quick"}`; they are 1 to 2 beats, `delta.beat.hint` is set, `kind:"drill"`): `swe-drill-commit-hygiene`, `swe-drill-verify-edge-case`, `swe-drill-review-pushback`, `swe-drill-clarify`, `swe-drill-conventions`, `bank-drill-self-approval`, `bank-drill-neutral-reply`, `bank-drill-escalation`, `bank-drill-memo`, `bank-drill-triage`, `nurse-drill-sbar`, `nurse-drill-privacy`, `nurse-drill-scope`, `nurse-drill-note`, `nurse-drill-prioritise`, `cons-drill-answer-first`, `cons-drill-numbers`, `cons-drill-scope`, `cons-drill-structure`, `cons-drill-client`. The report's `nextSteps[].drillId` tells you which one to offer.

## 4. Event details the UI must handle

- `channel` values in use: `chat`, `review`, `checks`, `call` (the banking customer; render like chat with a phone icon), `system`.
- `kind` values in use: `message`, `system`, `notice`, `artifact`, `review_comment` (has `meta.severity`, `meta.commentFile`, `meta.commentLine`), `check_result` (has `meta.checks[]`; hidden checks are named "Hidden check N" with a vague message), `consequence` (a returning consequence; render as the amber card).
- `source`: `learner`, `script`, `agent`, `engine`. When `fallback:true`, show the small "scripted" tag.
- `meta.quickReplies` on some manager/colleague messages: render as chips.
- **Nurse:** a `system` event adds new observations and replaces the `it_bed` record. The response `delta.changedItems` contains the updated item; also `meta.itemId` on that event. Refresh that item in the Items panel and flash a small "Updated" badge.
- Artifacts events (`kind:"artifact"`) have body `**Title**\n\ncontent` and `meta.artifactId`.
- `delta.canAdvance` / `canFinish` are authoritative. `delta.beat.title` already includes "Beat N of M · Title".
- `MissionState.variantLabel` is e.g. "Variant XAWJ · bulk-order pricing". Show it near the clock; **New variant** = `POST /missions` with `reseed:true`, then route to the new mission.
- `MissionState.runtime.agentModels` lists the model id per person; show it in the Engine Trace drawer header and on hover over a person.

## 5. Quick checks you can run in a terminal

```bash
B=https://ayden-app-388558128884.asia-south1.run.app/api/v1
curl -s $B/health
curl -s $B/roles | head -c 400
curl -s $B/system/status | head -c 600
```

## 6. Honest status labels (keep them in the UI)

Built: four role packs, engine, scoring, reports, progress, drills, cohorts, privacy, Firestore, Cloud Run, BigQuery anonymous analytics rows.
Planned: Data Analyst role, Sensitive Data Protection, Google sign-in, voice, "Full day" mode. The `GET /system/status` response is the source of truth for the "How it works" page.
