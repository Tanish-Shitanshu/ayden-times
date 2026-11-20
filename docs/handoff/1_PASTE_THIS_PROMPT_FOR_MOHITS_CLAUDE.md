# Prompt to paste into Mohit's Claude Code (together with the file 2_INTEGRATION_NOTES.md)

The Ayden backend is now **live on Google Cloud**. Read `2_INTEGRATION_NOTES.md` fully, then do the following in your existing `apps/web` (or `ayden-web`) project without throwing away your work.

1. **Connect to the real API.** Add the Vite proxy from the notes (it points `/api` at the live Cloud Run URL and fixes the cookie), set `VITE_API_MODE=live`, and run the app. The mock layer stays only for development.
2. **Contract:** `contract.ts` v1.0 is unchanged. The notes list the only behavioural differences (for example `pending` is always `false`, `finish` also returns `reportId`). Do not edit `contract.ts`. If a real response does not match a type, write it down and tell Tanish.
3. **Walk the whole demo path against the live server** for the Software Engineer role first (landing, `/demo`, consent, onboarding, mission, report, progress, drill), then Banking, Nurse and Tech Consulting. Data Analyst is `status: "planned"` and must stay a non-clickable "Planned" card.
4. **Handle these real behaviours** (they are listed in the notes with detail): the runtime banner when `runtime.mode !== "live"`, the `scripted` tag on fallback lines, `check_result` events that can take up to about 25 seconds, `review_comment` cards with file and line, `consequence` cards, the Nurse record item that changes mid-mission (`delta.changedItems` and `meta.itemId`), the `call` channel used by the banking customer, hidden check names masked as "Hidden check N", `attempt_cap` and `rate_limited` errors, drills (`drillId`, `beat.hint`), and the **New variant** button (`reseed: true`).
5. **Re-run your QA matrix** (section 12 of the frontend brief) in live mode on a phone and report which rows pass and which fail.
6. Commit small and often under Mohit's git identity only, with no Claude attribution lines. Never print or commit secrets. There are no secrets in the frontend.

When something in the backend looks wrong (wrong event, missing field, error), copy the request, the response and the mission id and send it to Tanish: his Claude fixes the backend.
