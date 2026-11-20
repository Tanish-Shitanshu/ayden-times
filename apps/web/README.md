# Ayden web (`apps/web`)

The full Ayden learner UI: landing, roles, onboarding and consent, the mission workspace, Skill X-ray debrief, Ramp Map progress, group console, privacy centre and the "How it works" page for judges. Built to `01_FRONTEND_BRIEF.md` against contract v1.0 (`src/contract.ts`, an untouched copy).

Stack: Vite 6, React 19, TypeScript (strict), react-router 7 (data router), plain CSS with design tokens, CodeMirror 6, zustand, marked + DOMPurify. Fonts (Google Sans Flex, Google Sans Code, Material Symbols Rounded) are self-hosted from `@fontsource-variable/*`, so the app has no third-party runtime requests.

## Run

```bash
npm install
npm run dev          # LIVE: Vite proxies /api to the Cloud Run API (cookie fix included), http://localhost:5173
npm run dev:mock     # mock mode: in-browser fixtures, no network
npm run build        # production build → dist/, VITE_API_MODE=live, same-origin /api/v1
npm run typecheck
```

### Live backend

- Live API: `https://ayden-app-388558128884.asia-south1.run.app/api/v1`
- `npm run dev` proxies `/api` there. Cloud Run sets `Secure` cookies, so the proxy strips `Secure` and rewrites the cookie domain to `localhost`. Point it elsewhere with `VITE_API_TARGET=http://localhost:8080 npm run dev`.
- **Production:** `npm run build`, then serve `dist/` from the same Cloud Run service (the API root currently says "The web app has not been built into this server yet"). No CORS or cookie changes are needed when it's on the same origin. Add an SPA fallback so unknown paths serve `index.html`.
- Switching mock ↔ live is only `VITE_API_MODE`. `.env.development` holds `live`, and `.env.mock` holds `mock`.

See `LIVE_API_FINDINGS.md` for what the live API returns and how the UI handles it.

In a live build the mock layer is not bundled at all (it sits behind a dynamic import that Vite removes).

## Mock mode

`src/api/mock/` is an in-browser backend that implements every endpoint in the contract, persisted in localStorage. It covers all five roles with complete missions, a drill per role, variants for "New variant", agent replies, rejected proposals in the Engine trace, sandbox-style checks with hidden checks, consequences, reports built from real signals in your transcript (quotes are verbatim substrings), progress, badges, and groups with k ≥ 5 suppression.

It simulates latency (400–1200 ms), `pending: true` followed by later events, a `processing` report that turns `ready` after 3 polls, `attempt_cap` (third try on the same variant), `consent_required`, and fallback mode.

**Mock panel:** the dashed "Mock" button (or `Ctrl+Shift+M`), only present when `VITE_API_MODE=mock`. Forces slow model, runtime `scripted`/`cached`, any error code for the next request, report delay or failure, a Planned role, and seeded group insights. "Reset all mock data" starts fresh.

`npm run build:preview` makes a hash-routed static mock build (`dist-preview/`) for sharing a clickable preview without a server.

## QA

`qa/qa-matrix.cjs` is a Playwright click-through of every row of the brief's §12 matrix (52 checks including sub-rows). Run it against a mock production build:

```bash
npx vite build --mode mock --outDir dist-mock && npx vite preview --outDir dist-mock --port 4173 &
BASE=http://127.0.0.1:4173 node qa/qa-matrix.cjs     # needs `playwright` available
node qa/axe.cjs                                      # axe-core WCAG 2 A/AA scan (needs axe-core)
```

`qa/qa-live.cjs` runs the same matrix against the **live** API at 360 px (phone emulation): `npm run dev` then `BASE=http://localhost:5173 node qa/qa-live.cjs`, or `BASE=<deployed web URL>`.

Status at handover: 52/52 pass in mock mode; axe reports no WCAG A/AA violations on landing, roles, role detail, onboarding, how-it-works and privacy. Rows still to re-run in **live** mode on a phone once the backend URL is set (brief §13).

## Where things are

```
src/contract.ts            copy of contract v1.0 (do not edit)
src/api/client.ts          one typed function per endpoint, ApiFailure, 401 handling
src/api/mock/              mock server, settings, five role packs
src/app/                   routes, Shell (header/footer/drawer), store, global dialogs
src/design/                tokens.css, base.css, components (Button, Chip, Dialog, Drawer, Menu, Tabs, Slider, …), Logo
src/features/              landing, roles, onboarding, mission (workspace), debrief, progress, cohort, privacy, how, common
src/content.ts             static landing/how-it-works copy; stats render only when verified: true
src/i18n/en.ts, hi.ts      UI chrome strings (Hindi is machine-assisted, not native-reviewed)
public/og.png              1200×630 social image; public/favicon.svg
```

## Contract questions for the backend

See `CONTRACT_QUESTIONS.md`. None block the build; each has a client-side workaround.
