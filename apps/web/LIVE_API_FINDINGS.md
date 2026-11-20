# Live API findings (web ⇄ backend v0.1), 20 Nov 2026

Checked against `https://ayden-app-388558128884.asia-south1.run.app/api/v1` (runtime `scripted`, commit `8fd3214`), by driving full flows through the API from a browser on the Cloud Run origin: Software Engineer (mission, report, progress, drills, drill reseed, New variant, attempt cap), Banking, Nurse and Tech Consulting (each to a ready report), plus groups, consent, export, profile and error paths.

**Every response matched `contract.ts` v1.0.** Nothing in the contract needs to change. The items below are behaviour notes. The web app already handles each one.

## For Tanish (worth a look, none blocking)

1. **Drills report the parent mission id.** For a drill session, `MissionState.missionId` is `swe-day3-bugfix`, not the drill id, so "New variant" on a drill cannot be rebuilt from the state alone. The web app now remembers the `drillId` it created each session with. Optional fix: return the drill id in `missionId` for `kind: "drill"`.
2. **`delta.changedItems` repeats unchanged items.** On Nurse, `it_bed` comes back in `changedItems` on almost every act, even when nothing changed. The contract says "only items that changed". The UI compares contents, so it only flags real changes.
3. **Neha's `check_result` event has no `meta.checks`.** That's valid, but it can't feed the Checks tab, so the UI uses the latest `check_result` that does carry `meta.checks`.
4. **Artifact events start with `**Title**`.** For example, `**Commit message**\n\nfixed discount`. The UI strips that line when it shows the submitted text and for "Edit and resubmit".
5. **`runtime.fallbackReason` is an internal string** (`LLM_MODE is scripted`). The UI keeps it out of the banner text and shows it only as a tooltip. Suggest plain language.
6. **Several ramp milestones can be `next` at once** (SWE: four of them). The UI handles that; just confirming it's intended.
7. **`report.integrity.judgeModel`** reads `rule-based (AI judge unavailable)` in scripted mode. The UI shows it as given.
8. **Data Analyst** is `planned` with `skillCount: 0`, and `POST /onboarding` for it returns `404 not_found "Role not available."` The UI never offers it.

## Behaviours confirmed and handled in the UI

| Behaviour | Live evidence | UI |
|---|---|---|
| `pending` always `false` | every act | polling stays idle; replies render from the act response |
| `finish` returns `{reportId, status: "ready"}`, mission becomes `done` at once | SWE, Banking, Nurse, Consulting | debrief opens straight to the report; `reportId` remembered |
| Runtime `scripted`, lines with `fallback: true` | `source: "script"` | warning banner + "scripted" tag on each fallback line |
| `check_result` in the act response (static fallback today, sandbox up to ~25 s later) | `Static checks (the sandbox was unavailable)…` | button spinner + skeleton rows + "can take up to about 25 seconds"; no client timeout |
| `review_comment` with `commentFile`/`commentLine`, and one with none | SWE beat 3 | card with severity chip; "Open file" only when a file is given |
| `consequence` from a person (`from: "ananya"`) | Banking beat 3 | amber consequence card in every thread; listed in the report |
| Record changes mid-mission (`delta.changedItems`, `meta.itemId`) | Nurse `it_bed` | "Updated" dot on the item and the Work tab, blue update card with "Open Bed 6 …" |
| `call` channel | Banking `caller` (Mr Chopra) | "Call" tag on bubbles; replies to that person go out on `call` ("Reply on the call to Mr…") |
| Hidden checks masked | server-side | shown as "Hidden check N" with a hidden chip |
| `attempt_cap` | 409 on the third start of a variant | plain-language error on the button and in a snackbar |
| `rate_limited` | not triggered (10 creations/hour would burn the quota) | countdown in the composer; snackbar with seconds on mission create |
| Drill with `beat.hint` | `swe-drill-commit-hygiene` | hint in Objectives |
| `reseed: true` | new seed and variant label | New variant, enabled only before the first learner action |
| `409 conflict` on act after finish | "This mission is finished." | snackbar |
