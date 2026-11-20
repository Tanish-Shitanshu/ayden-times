# Contract questions from the web app (v1.0)

None of these block the UI. Each has a workaround already in place. Proposed additions would go to `CONTRACT_CHANGES.md` if accepted.

1. **Mission → report lookup.** `MissionState` has no `reportId`, so `/mission/:id/debrief` cannot find its report after a refresh or from a shared link. Workaround: remember the id from `POST /finish`, else look it up in `GET /me/progress` → `attempts[].reportId`. Proposal: optional `MissionState.reportId`.
2. **"Reset file" source.** There is no original file content in the contract. Workaround: the client stores the first server snapshot of each file and restores it. Proposal: optional `originalContent` on editable file items, or a `reset_file` act.
3. **Team chat.** `ActRequest.message.to` must be a `PersonId`, so the learner cannot post to a team channel. The UI treats agent messages without `to` as Team chat and sends replies there to the first person (the manager). Confirm, or add `to: "team"`.
4. **Role title in the workspace.** `MissionState` has `roleId` only; the workspace makes one `GET /roles/:id` for the role chip. Fine as is.
5. **Edit and resubmit.** The brief says "only if attempt allows". The UI shows it while `attempt.number < attempt.max` and the mission is active. Confirm the server accepts a second `submit_artifact` for the same id.
6. **Email subject.** No field for it. The UI renders the first bold line of the body as the subject.
7. **New variant for drills.** The UI sends `{ roleId, drillId: mission.missionId, reseed: true }` for drills and `{ roleId, missionId, reseed: true }` for missions. Confirm `MissionState.missionId` equals the drill id for drill sessions.
8. **`act` on a finished mission.** The UI expects `409 conflict` with a plain-language message.
