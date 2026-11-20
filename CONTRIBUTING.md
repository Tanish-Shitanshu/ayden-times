# How we work on Ayden

This is the same discipline the product teaches.

1. **Read the ticket** (or the plan in `docs/plan`). Ask before you build if something is unclear.
2. **Behaviour first.** Write or update the scenario in `apps/api/features/*.feature`, then the test, then the code (BDD).
3. **Domain stays pure.** `apps/api/src/roles`, `domain/text.ts`, `domain/privacy.ts`, `domain/progress.ts` import no I/O. Model calls live in `agents/`, storage in `infra/`.
4. **Every model output is validated.** Tool proposals go through `validateReply`; judge quotes are verified verbatim; structured output is length- and shape-checked.
5. **Commit format:** `type(scope): summary`. Types: feat, fix, test, docs, refactor, chore, build. Imperative, 72 characters max.
6. **Tests with every fix.** `npm test` must pass. Add an injection or boundary test when you touch agent code.
7. **Style:** TypeScript strict, ESLint, Prettier. No `console.log` in app code (use `infra/log.ts`).
8. **Secrets:** never commit keys or connection strings. Env files are git-ignored. Run `git log -p | grep -iE "AIza|api[_-]?key|secret"` before pushing.
9. **Pull requests** explain Why, What changed, How I tested, Risks.
10. **Out-of-scope ideas** become a new issue, not part of your change.
