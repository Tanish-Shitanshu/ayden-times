---
name: ayden-role-pack
description: How to author a new Ayden role pack (a job rehearsal scenario). Use when adding or editing a role in apps/api/src/roles, including skills, anchors, beats, traps, artifacts and drills.
---

# Authoring an Ayden role pack

A pack is data plus small pure functions. Copy `apps/api/src/roles/banking-ops.ts` as a template.

1. **Skills (5).** Each has a label, plain-language description, target (anchors needed) and a badge title.
2. **Anchors.** Observable behaviours. `kind: "code"` = deterministic evaluation over events, artifacts, flags. `kind: "judge"` = needs judgement; provide a keyword `eval` as the transparent fallback and a `judgeInstruction` for the quote-bound judge.
3. **Beats (4).** Each has an objective, `onEnter` scripted events (or a function for consequences) and an `advanceWhen` condition.
4. **Traps** are normal-looking moments that test judgement. Tie each to an anchor with `trapFrom`.
5. **Artifacts** are things the learner writes (commit, PR, SBAR, memo, email). Check them with code first.
6. **Hidden truth** is recomputed from variant numbers in code, never typed into persona prompts beyond what that person knows (`facts[].knownBy`).
7. **Variants:** `varsFor(seed, variantIndex)` must be deterministic.
8. **Safety:** fictional companies; label any scenario that has not been reviewed by a domain expert (`safetyNote`).
9. **Tests:** add an ideal-run and a careless-run e2e test in `apps/api/test`.
