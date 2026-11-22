# Contract change log

Format: `YYYY-MM-DD HH:MM · requested by · change · status`. The backend owns `packages/contract/src/index.ts`.

- 2026-11-20 21:45 · backend · `POST /missions/:id/act` with `{kind:"finish"}` also returns `reportId` (extra field); `pending` is always `false` in v0.1 (agent replies are awaited server-side, max ~25 s). Polling still works. · accepted
- 2026-11-22 10:40 · web (Mohit) · `RoleId` gains `"executive"` (Startup CEO decision-making role, status ready). Role list and `/roles/executive` return it; no other shape changes. Backend pack in `apps/api/src/roles/executive.ts`. · applied on both sides
- 2026-11-22 12:00 · web (Mohit) · New additive endpoints `POST /api/v1/feedback` and `GET /api/v1/traction` (public, aggregate only). No existing shape changed; types live in `apps/web/src/api/client.ts`. · applied on both sides
- 2026-11-22 14:35 · backend (Tanish) · `RoleId` gains `"finance-analyst"`, `"procurement"`, `"marketing"`; `ArtifactSpec.kind` gains `"spreadsheet"` (the web offers an .xlsx upload that is read in the browser and sent as text). Software Engineer gains a second mission `swe-tech-decisions`. Nurse, CEO, Banking, Consulting and Data Analyst are hidden from `/roles` (still reachable by id). · applied on both sides
