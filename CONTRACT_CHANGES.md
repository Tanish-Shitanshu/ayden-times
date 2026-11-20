# Contract change log

Format: `YYYY-MM-DD HH:MM · requested by · change · status`. The backend owns `packages/contract/src/index.ts`.

- 2026-11-20 21:45 · backend · `POST /missions/:id/act` with `{kind:"finish"}` also returns `reportId` (extra field); `pending` is always `false` in v0.1 (agent replies are awaited server-side, max ~25 s). Polling still works. · accepted
