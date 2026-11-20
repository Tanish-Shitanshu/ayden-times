# Integration notes (web + API)

## Layout
- `apps/api`: Fastify + TypeScript API, engine, agents, role packs. Built with tsup to `apps/api/dist/server.js`.
- `apps/web`: Vite + React app (`@ayden/web`). `npm run build` writes `apps/web/dist`.
- `packages/contract`: API types, source of truth. `apps/web/src/contract.ts` is an identical copy (checked at merge).
- Root `package.json` uses npm workspaces. `npm run build` builds the web app first (`scripts/build-web.mjs`), then the API.

## One origin
`apps/api/src/app.ts` registers `/api/v1/*` first, then serves `apps/web/dist` with `@fastify/static` and falls back to `index.html` for client-side routes. Unknown `/api/*` paths return a JSON 404. The Dockerfile builds both and copies `apps/web/dist` into the runtime image. No CORS is needed and the `ayden_sid` cookie is same-origin.

## Local development
- Web only against the live API: `cd apps/web && npm run dev` (Vite proxies `/api`, strips `Secure` so `http://localhost` accepts the cookie).
- Fully offline UI: `npm run dev:mock` (in-browser mock backend, never bundled into production).
- Full stack on one port: `npm run build`, then `SANDBOX=local-python npm start` and open `http://localhost:8080`.
- Windows: the local sandbox uses `python` (not `python3`); shell scripts are kept on LF (`.gitattributes`).

## Deploy
Cloud Run service `ayden-app`, project `ayden-buildathon`, region `asia-south1`, deployed from source:

    gcloud run deploy ayden-app --source . --region asia-south1 --project ayden-buildathon \
      --update-env-vars LLM_MODE=live,MODEL_AGENT=gemini-3.5-flash-lite,MODEL_REASON=gemini-3.1-flash-lite,MODEL_TESTER=gemini-3.1-flash-lite,COMMIT_SHA=$(git rev-parse --short HEAD) --quiet

Existing env vars, the service account and the `session-secret` and `gemini-api-key` secret mounts persist between deploys. The Gemini key lives only in Secret Manager (`gemini-api-key`); add a new version, then update the service to start a new revision.

## Models (free tier, verified 20-21 Nov 2026)
The default Gemini 4 models hung or returned quota errors on a free key. These answered reliably: `gemini-3.5-flash-lite` (colleagues), `gemini-3.1-flash-lite` (judge, code-execution tester), `gemini-embedding-2`. Models are env vars, so they can be swapped without code changes. If a call fails or is rate limited the app falls back to scripted behaviour and flags it in the UI.

## Behaviour fixes made during integration
- The engine now emits a `beat` event ("Beat N of M · title") when the learner advances, so the UI shows a beat divider.
- Windows: web build spawn and local Python sandbox binary.
