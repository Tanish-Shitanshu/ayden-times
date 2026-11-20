# 01 · Frontend Brief (for Mohit's Claude Code)

> **Kickoff prompt for Mohit to paste into his Claude:**
> "Read `00_MASTER_PLAN.md`, `01_FRONTEND_BRIEF.md`, `02_API_CONTRACT.md` and `contract.ts` completely. Then build the Ayden web app exactly as `01_FRONTEND_BRIEF.md` specifies. Work only in `apps/web` (or an empty folder `ayden-web` if the repo is not ready). Do not change `contract.ts`. Use mock mode until the backend URL arrives. Follow the QA matrix in §12 and report which rows pass. Commit small and often under my git identity only, with no Claude attribution lines."

You are building the **entire user interface** of **Ayden**, an AI workplace rehearsal platform. The backend is built in parallel by another Claude and speaks the exact contract in `02_API_CONTRACT.md` / `contract.ts`. You build against fixtures first, then flip one env flag to the live server.

**Quality bar:** this will be judged at a Google hackathon by Google mentors. It must look and feel like a Google product: clean, calm, spacious, legible, confident, fully working. A polished product with six working screens beats twelve broken ones; but every screen listed here **must exist and every control on it must work**.

---

## 1. Non-negotiables (these are the mistakes that sank earlier builds)

1. **Every button, link, chip, card, menu item and icon that looks clickable does something real.** It navigates to a real route, calls a real API function, opens a real dialog, or is visibly disabled with a reason. No `href="#"`, no empty `onClick`, no "coming soon" alerts. Things that are not built are shown as **non-interactive "Planned" labels** (grey, no hover state, no pointer cursor).
2. **Back navigation exists everywhere** (§4.2). Every screen deeper than the first level has a top-left back arrow with an explicit destination, and browser Back works because state lives in routes, not hidden component state.
3. **Every screen has all states:** loading (skeleton, not a spinner on white), empty, error (with Retry), slow (after 8 s show "Still working, the AI is thinking…"), and offline/fallback banner when `runtime.mode !== "live"`.
4. **No mock in the shipped build.** `VITE_API_MODE` defaults to `live`. Mock mode exists only for development and for the hidden dev panel.
5. **Never hardcode role content, skills, people or text from missions.** Render what the API returns. (Landing and "How it works" copy is static; see `content.ts`.)
6. **Honesty labels are part of the design:** "MVP in progress", "Planned", "scripted" tag on fallback lines, "seeded demo data" on any non-live data, "Training scenario, not clinical advice" on nurse content, "Formative feedback, not a hiring score". Never show a statistic that is not in `content.ts` with `verified: true`.
7. **No leaderboards, rankings, points-vs-others, or "top learners" anywhere.** Progress is only "you vs your own target".
8. **Mobile-first.** Test at 360 px, 768 px, 1280 px. No horizontal scroll. Touch targets ≥ 48 px.
9. **Accessibility:** keyboard reachable everywhere, visible focus, WCAG AA contrast, `aria-live="polite"` for new chat messages, `prefers-reduced-motion` honoured, form labels, alt text.
10. **Write real copy**, plain language, short sentences, no filler, no emojis in UI chrome.

---

## 2. Stack and structure

* **Vite + React 19 + TypeScript (strict) + react-router v7 (data router).** Plain CSS with design tokens as CSS variables (no heavy UI kit). Small utility libs allowed: `@uiw/react-codemirror` + `@codemirror/lang-python` + `@codemirror/lang-sql` (code editor; **not Monaco**), `marked` or `react-markdown` + `dompurify` (markdown-lite), `zustand` (small local UI state only), `framer-motion` optional (keep motion subtle).
* **Fonts:** try Google Sans / Google Sans Flex from Google Fonts first; fall back to `Roboto Flex`/`Roboto`. Mono: `Google Sans Code` → `Roboto Mono`. Icons: **Material Symbols Rounded** (Google Fonts), outlined, weight 400, optical size 24.
* Serve everything from the same origin; use relative URLs `/api/v1/...`; Vite dev proxy `/api → http://localhost:8080`.

```
apps/web/
  index.html  vite.config.ts  tsconfig.json  .env.example (VITE_API_MODE=live, VITE_API_BASE=)
  src/
    contract.ts                  (copy of contract.ts, untouched)
    api/client.ts                one function per endpoint (typed)
    api/mock/*.ts                fixtures for every endpoint and every role
    app/routes.tsx  app/Shell.tsx
    design/tokens.css  design/base.css  design/components/*.tsx   (Button, Chip, Card, TextField, Dialog, Snackbar, Tabs, Skeleton, Banner, Avatar, Progress, Slider…)
    features/{landing,roles,onboarding,mission,debrief,progress,cohort,privacy,how,common}/
    content.ts                   static copy, sourced stats with verified flags, Hindi strings
    i18n/en.ts  i18n/hi.ts       UI chrome strings only
    lib/{markdown,time,hooks,a11y}.ts
```

---

## 3. Design system: "Google-style" (follow closely)

**Principles:** white space, quiet colour, one clear primary action per view, rounded friendly shapes, content first, no heavy shadows, generous line-height.

### 3.1 Colour tokens (`tokens.css`; define light and dark; dark via `prefers-color-scheme` plus a manual toggle)

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#202124` |
| `--surface` (cards) | `#ffffff` | `#292a2d` |
| `--surface-variant` (tonal blocks) | `#f1f3f4` | `#303134` |
| `--primary` | `#1a73e8` | `#8ab4f8` |
| `--on-primary` | `#ffffff` | `#202124` |
| `--primary-container` | `#e8f0fe` | `#394457` |
| `--text` | `#202124` | `#e8eaed` |
| `--text-secondary` | `#5f6368` | `#9aa0a6` |
| `--outline` | `#dadce0` | `#5f6368` |
| `--success` | `#1e8e3e` (bg `#e6f4ea`) | `#81c995` |
| `--warning` | `#b06000` (bg `#fef7e0`) | `#fdd663` |
| `--error` | `#d93025` (bg `#fce8e6`) | `#f28b82` |
| `--purple` (data role) | `#9334e6` | `#c58af9` |
| Role accents | from `RoleSummary.accentHex` (used only for chips, avatars, icon tiles, never for body text) | |

### 3.2 Type scale (Google Sans / Roboto fallback)

Display 44/52 (landing hero only) · Headline L 32/40 · Headline M 28/36 · Title L 22/28 · Title M 16/24 medium · Body L 16/24 · Body M 14/20 · Label 12/16 medium, letter-spacing .2px. Max line length 72 characters. Headings are sentence case. Numbers use tabular figures.

### 3.3 Shape, spacing, elevation, motion

* 8 px grid. Page gutters 16 (mobile) / 24 / 40 (desktop). Content max width 1200 (workspace is full-bleed).
* Radius: buttons fully rounded (pill, 999 px, height 40, 48 for hero); cards 16; chips 8; dialogs 28; inputs 8 (outlined, 56 px tall, floating label).
* Cards are **outlined** (1 px `--outline`), no shadow at rest; hover raises with a 1 px darker outline plus `0 1px 3px rgba(60,64,67,.15)`. Dialogs/menus use `0 8px 24px rgba(60,64,67,.2)`.
* Buttons: **Filled** (primary), **Tonal** (primary-container), **Outlined**, **Text**. Hover/pressed state layers 8%/12%. Focus ring 2 px `--primary` with 2 px offset. Disabled 38% opacity with `aria-disabled` and a tooltip/helper text explaining why.
* Motion: 150-250 ms, `cubic-bezier(0.2, 0, 0, 1)`; skeleton shimmer; page transitions fade 120 ms; no bouncing. `prefers-reduced-motion` → no transforms.
* Top app bar 64 px, 1 px bottom divider, sticky. Navigation rail (80 px) on the workspace left edge on desktop; bottom navigation (64 px) on mobile where specified.
* Snackbars bottom-left on desktop, bottom-centre on mobile, 4 s, with optional action.

### 3.4 Logo and brand

Build an **Ayden** wordmark (Google Sans medium, `--text`) plus a small glyph: a rounded chevron/paper-plane "ascending" shape in `--primary`. Provide `Logo.tsx` (SVG, light/dark), favicon, and a 1200×630 social image. **Do not use Google, DeepMind or Gemini logos or imitate them.** In the footer and on `/how-it-works` write the Google product names as plain text ("Gemini API", "Cloud Run", "Firestore") with the label "Built with Google AI and Google Cloud".

---

## 4. App shell and navigation

### 4.1 Route map

| Route | Screen | Top bar left | Auth |
|---|---|---|---|
| `/` | Landing | Logo | – |
| `/demo` | One-click judge entry (see §5.1) | – | creates guest |
| `/roles` | Role grid | Logo | – |
| `/roles/:roleId` | Role detail | ← Back to roles | – |
| `/onboarding/:roleId` | Self-rating + consent | ← Back to role | guest |
| `/mission/:missionId` | Workspace | ✕ Exit mission (confirm) | guest |
| `/mission/:missionId/debrief` | Skill X-ray report | ← Back to role | guest |
| `/progress` and `/progress/:roleId` | My Ramp Map | ← Back to roles | guest |
| `/cohort` | College/company console | ← Back | guest |
| `/join/:code` | Join cohort link | – | guest |
| `/privacy` | Privacy centre | ← Back | guest |
| `/how-it-works` | Architecture and Google stack page | ← Back | – |
| `*` | 404 with link home | Logo | – |

### 4.2 Back-navigation rules

1. Top-left control on every non-root screen: **back arrow + label of the destination** ("← Roles", "← Software Engineer"). It uses `navigate(-1)` only if the previous history entry is inside the app; otherwise navigates to the listed destination.
2. In the workspace the control is **✕ Exit mission** → confirm dialog ("Your progress is saved. You can resume from My progress.") with **Resume** (filled) and **Exit** (text). Exit goes to `/roles/:roleId`.
3. In every dialog, drawer and sheet: `Esc` closes, focus returns to the trigger, there is a visible close icon and a text action.
4. In the debrief: "← Back to role" and a persistent footer bar with **Start recommended drill** (primary) and **See my progress** (outlined).
5. Breadcrumbs (desktop only) on role detail, debrief and progress: `Roles / Software Engineer / Report`.

### 4.3 Global header (all screens except workspace, which has its own bar)

Left: Logo → `/`. Centre/right nav: **Roles** `/roles` · **My progress** `/progress` · **How it works** `/how-it-works` · **Privacy** `/privacy`. Right: language toggle **EN | हिं** (persists, updates all UI chrome) · theme toggle (light/dark/system) · account chip (guest name; menu: **Edit name** dialog → `PATCH /me`, **Privacy centre** → `/privacy`, **Delete my data** → confirm dialog → `DELETE /me` → `/`). Mobile: hamburger opens a full-height drawer with the same items.
Footer: "MVP in progress. Practice feedback, not a hiring score." · Built with Google AI and Google Cloud (text) · links Privacy, How it works · **Give feedback** (opens `content.feedbackUrl` in a new tab; render the link only if that string is non-empty).

---

## 5. Screens, component by component

For each control: **→** is where it goes or what it calls.

### 5.1 Landing `/`

* **Hero:** Display "Rehearse your first 90 days." · subhead (Body L): "Practise the real work of your first job with an AI team, find the skills you are missing, and fix them before day one." · Primary **Try the demo, no sign-up** → `/demo` · Outlined **See how it works** → `/how-it-works` · small text "Takes 20 to 25 minutes. Private to you."
* **The loop (3 cards):** Diagnose · Train · Prove (icon tile + 2 lines each; not clickable).
* **What new hires are never taught (strip):** four chips: "Commit and PR hygiene", "Escalating at the right time", "Reading a team's unwritten rules", "Saying no with a reason". Not clickable.
* **Five role cards** (from `GET /roles`): icon tile in `accentHex`, title, tagline, domain chip, `~N min`. `ready` → whole card clickable → `/roles/:id`. `planned` → no hover, label "Planned".
* **Why now (sourced stat block):** render items from `content.ts` where `verified: true`; if none are verified, render the qualitative sentence only.
* **Private by design (3 bullets):** you own your report · companies see only anonymous group patterns (groups of 5+) · no leaderboards. Link "Read how privacy works" → `/privacy`.
* **Built with Google (text row):** Gemini API · Cloud Run · Firestore · Secret Manager. Link → `/how-it-works`.
* **Footer CTA:** Filled **Try the demo** → `/demo`.

### 5.1b `/demo` (judge entry)

No UI beyond a centred progress card "Setting up your demo…". Sequence: `POST /session/guest` → `PUT /me/consent` is **not** automatic. Instead navigate to `/onboarding/software-engineer?demo=1`. In demo mode the onboarding screen pre-fills sliders to 3 and shows the consent card (judge must tick it; one tap). Query param `?role=<id>` selects another role. On any error show the error card with **Retry** and **Back to home**.

### 5.2 Roles `/roles`

Page title "Choose a role to rehearse". Grid of 5 cards (1 col mobile, 2 tablet, 3 desktop). Card: icon tile, title, company line, tagline, chips (domain, `~N min`, `N skills`), footer: **Start** (tonal) for `ready` → `/roles/:id`; label "Planned" otherwise. If the user has progress in a role, a small chip "In progress" or "2 of 6 milestones". Section below: "Not a leaderboard, just you versus your target." (static text).

### 5.3 Role detail `/roles/:roleId`

* Header: icon, title, company, tagline, `safetyNote` as a **Banner** (warning style) if present.
* Tabs (accessible tablist): **Overview** · **Skills** · **Your team** · **Ramp map**.
  * Overview: `description`, `whatYouWillPractise` bullets, mission cards (`missions[]`: title, description, `~N min`, skills chips).
  * Skills: each `SkillDef` as an expandable card (label, description, anchors as bullets titled "What we look for").
  * Your team: `cast[]` cards (avatar, name, title, blurb, `modelLabel` chip "Gemini 4 Hydrogen").
  * Ramp map: vertical timeline of `rampMap` (week chip, title, description, state chip: Achieved / Next / Planned). **Planned items are not links.**
* Sticky bottom bar (mobile) / right panel (desktop): mode selector **Quick, ~25 min** (selected) and **Full day, planned** (disabled, label Planned) · Filled **Start rehearsal** → if `Me.consent` or `Me.onboardings` lacks this role → `/onboarding/:roleId`, else `POST /missions {roleId, mode:'quick'}` → `/mission/:id`. If the user has an unfinished mission for this role, show **Resume mission** (→ `/mission/:id`) as primary and "Start new" as text.

### 5.4 Onboarding `/onboarding/:roleId`

Three steps with a stepper; each step has **Back** and **Next**; step 1 Back → `/roles/:roleId`.
1. **Your experience:** radio cards (`none`: "I have never worked in this role", `some`: "I have done projects or training", `internship`: "I have been an intern or worked in it").
2. **How confident are you?** one slider (1-5) per `SkillDef` (label + description + live value text "3 of 5: somewhat confident"). Helper: "We compare this with what you actually do. Nothing is shared." All sliders keyboard operable.
3. **Consent card:** checkbox 1 (required) "I am 18 or older." · checkbox 2 (required) "Save my messages and work so my report can quote them." · checkbox 3 (optional) "Let my college or employer see anonymous group patterns (never my individual results)." Link "How your data is used" → `/privacy` (opens in the same tab; returns via Back). Filled **Start rehearsal** is disabled until 1 and 2 are checked (helper text says why). On click: `PUT /me/consent` → `POST /onboarding` → `POST /missions` → `/mission/:id`. Show a progress state on the button; on error show the API message inline with Retry.
If consent already exists, skip to step 1 and hide step 3 (show a small "Consent saved. Change in Privacy centre" note).

### 5.5 Mission workspace `/mission/:missionId` (the main product)

**Layout, desktop ≥ 1100 px (full bleed, no global header):**

```
┌──────────────────────────── Top bar (64) ─────────────────────────────────────────────┐
│ ✕ Exit   Title · Company   [role chip]    Beat stepper (1 2 3 4)   Clock "Wed 09:34"  │
│                                           [Objectives ▾]  [Engine trace]  [⋯ menu]     │
├────────────┬───────────────────────────────────────────────┬───────────────────────────┤
│ Left rail  │ Center: Conversation  (tabs: Chat · Email*)    │ Right: Work panel         │
│ (260)      │  message list (aria-live), composer           │  Tabs: Files/Items · Write │
│ People     │                                               │  · Checks                 │
│ Channels   │                                               │                           │
│ Items list │                                               │                           │
└────────────┴───────────────────────────────────────────────┴───────────────────────────┘
```
(*Email tab only if the role's missions use email events.) Tablet: left rail collapses to icons. **Mobile:** bottom navigation with four tabs **Chat · Work · Checks · Team**, one full-screen pane at a time; top bar shows title, clock, beat, and a ⋯ menu (Objectives, Engine trace, Exit).

**Top bar controls**
* **✕ Exit** → confirm dialog (Resume / Exit → `/roles/:roleId`).
* **Beat stepper:** "Beat 2 of 4 · title" with dots; not clickable (shows `beat.title`).
* **Clock:** `clock.label` and a thin progress bar (`minute / minutesTotal`). Tooltip "Time moves when you act. It is a simulation."
* **Objectives ▾** → popover card with `beat.objective`, a checklist of required artifacts (`artifacts[]` with ✓ when `submitted`), and `beat.hint` if present ("Hint (first drill only)").
* **Engine trace** → opens the **Trace drawer** (right side, 420 px; bottom sheet on mobile). Each `TraceEntry`: actor + model chip, summary, verdict chip (accepted green / rejected red with reason), latency. Header text: "The AI proposes. The engine decides." Filter chips: All · Accepted · Rejected. Includes a one-sentence explainer and a link "How this works" → `/how-it-works#engine`. Auto-scrolls to newest; can be pinned open.
* **⋯ menu:** **New variant** (only when the mission is at beat 0 and no learner action yet; else disabled "Available at the start") → confirm → `POST /missions {…reseed:true}` and replace route; **Report a problem** (opens dialog with free text + Copy diagnostics button, copies mission id, seed, last 5 trace ids; no network call); **Keyboard shortcuts** dialog.

**Left rail**
* **People** (from `people[]`): avatar (initials on hue colour), name, title, presence dot, a tiny "AI" chip when `kind==='agent'`. Click → selects the conversation with that person (center). Unread dot when new events from them while another thread is open. Hover/focus tooltip shows `modelLabel`.
* **Channels:** Team chat (all-hands thread) when present.
* **Items** (from `items[]`): icon by `type` (ticket, description, article, table_chart, person) + title. Click → opens it in the right Work panel (`open_item` action sent fire-and-forget).
* **Required artifacts:** list from `artifacts[]` with status ✓/○; click → switches Work panel to **Write** with that artifact selected.

**Center: conversation**
* Message bubbles (own right, others left), avatar, name, sim time (`simMinute` → clock label), `fallback` tag "scripted" (chip, secondary). `review_comment` events render as **review cards** (file path + line, severity chip: Blocker red / Suggestion blue / Nit grey / Question purple, body, and button **Open file** → opens the file at that line in the editor). `check_result` events render as a compact **Checks card** (counts + list; failed items red) with button **Open Checks**. `consequence` events render as an amber **"Consequence" card** with a clock icon. `system`/`notice`/`beat` events render as centred, muted lines. `artifact` events render as "You submitted: {title}" cards (expandable).
* `meta.quickReplies` render as chips under the message; clicking sends that text via `message` act.
* Composer: multiline textarea (auto-grow, 4000 chars), placeholder "Message {name}…", **Send** (filled icon button, `Enter` sends, `Shift+Enter` newline), counter near limit. Disabled with helper text while a request is in flight or when `status !== 'active'`.
* Typing indicator ("{name} is replying…") while `pending`. If `pending` > 8 s, show "Still working, the AI is thinking…". Polling per contract. On 429 show countdown from `retryAfterMs`.
* Scroll behaviour: stick to bottom unless the user scrolled up; show a "New messages ↓" pill.

**Right: Work panel (tabs)**
* **Items:** viewer by `WorkItem.type`:
  * `file` → CodeMirror editor, language from `language`, line numbers, soft-wrap off, mono font. If `editable` is false: read-only with a lock icon. Editable: autosave (`save_file`, debounce 1500 ms) with "Saved ✓ / Saving…" indicator. Toolbar: **Run checks** (filled; `run_checks`) · **Reset file** (text; confirm; restores `content` from last server snapshot) · file tabs if multiple files.
  * `doc` → rendered markdown, table of contents for long docs.
  * `ticket` → card: key, title, status chip, priority chip, description. (Read only.)
  * `table` → accessible table (sticky header, zebra, horizontal scroll on mobile), `note` caption.
  * `record` → definition-list card (label/value grid).
* **Write** (artifact composers): tab per `ArtifactSpec`; **title**, instructions (Body M), template prefilled, textarea or code-style box by kind (`commit_message`: mono, single-line subject counter showing 0/72 with a gentle hint when over; `pr_description`/`memo`/`email`/`sbar`/`text`: textarea with section headings preserved; `sql`/`code`: CodeMirror). Char counter vs `maxChars`. **Submit** (filled; `submit_artifact`; disabled when empty or `submitted`; after success the composer becomes read-only with "Submitted ✓", and an **Edit and resubmit** text button only if `attempt` allows). Do **not** show correctness hints beyond what the API returns.
* **Checks:** latest `check_result` summary, list of `CheckResult` with pass/fail icons and `message`; hidden checks show as "Hidden check N". **Run checks** button here too. Empty state: "Run checks to see how your work does." While running show skeleton rows and "Running in a Google-hosted sandbox…" (can take ~20 s).

**Progression controls (sticky at the bottom of the center column)**
* **Continue to next beat** (tonal) → `act advance`; enabled only if `canAdvance`; otherwise disabled with helper text from `beat.objective` ("Finish the objective to continue").
* **Finish and see my report** (filled) → `POST /missions/:id/finish`; enabled only if `canFinish`; confirm dialog ("You cannot change your answers after this."). On success navigate to `/mission/:id/debrief`. While `status==='judging'` show the **Reading your work** full-screen state.
* If `attempt.max` reached for a variant and the mission is finished, show nothing extra here; the debrief handles retry.

**Resume:** on load, `GET /missions/:id` + `GET /missions/:id/events?since=0`, restore selected thread and scroll position. If `status==='done'` redirect to the debrief.

**Mobile specifics:** bottom nav tabs: **Chat** (center), **Work** (Items/Write), **Checks**, **Team** (people list + artifacts list). Floating "Objectives" chip below the top bar. Trace opens as a bottom sheet from the top-bar ⋯ menu.

### 5.6 Debrief `/mission/:missionId/debrief` ("Skill X-ray")

* `GET /reports/:id` (poll while `processing`): full-screen "Reading your work…" with three rotating lines ("Checking your messages", "Verifying every quote", "Building your skill map"); never a bare spinner. On `failed` show error card with **Retry** (`GET` again) and **Back to role**.
* **Header:** headline (Headline M) + summary (Body L). Lock chip: "Only you can see this" (tooltip = `privacyNote`). Honest chip: "Formative feedback, not a hiring score."
* **Skill map:** one card per `SkillResult` (grid): label · state chip (Strong green / Developing amber / Gap red / Uncertain grey) · three horizontal bars: **You said** (selfRating mapped to 0-100%), **You showed** (`anchorsMet/anchorsTotal`), **Target** (`target/anchorsTotal` as a marker line) · `confidenceGap` sentence ("You rated yourself higher than your work showed.") · expandable **What we saw**: signals list with ✓/✗ and source icon (code / reviewer) · **Evidence quotes** (blockquote, tone good/miss, `verifiedBySystem` ✓ "Verified in your messages") with link **View in conversation** (opens the transcript drawer scrolled to `eventSeq`; data from `GET /missions/:id/transcript`) · `missedFact` in an info box "What you did not know".
* **Key moments:** list with quote + why.
* **Consequences timeline:** items with clock icons.
* **Next steps:** cards from `nextSteps[]` with title, why (references the learner's own words), `~N min`, scaffold chip ("With a hint" / "No hint"). Primary **Start drill** → `POST /missions {roleId, drillId}` → `/mission/:id`.
* **How this was scored (integrity accordion):** judge model, mode, quotes verified/rejected, uncertain skills, notes. Link "How scoring works" → `/how-it-works#scoring`.
* **Share (opt-in):** tonal **Copy a positive growth summary** → shows dialog with `shareSummary` text and what is and is not included ("Only strengths and what you are working on. No scores, no transcripts."); **Copy** button copies, snackbar "Copied".
* **Footer bar:** **Start recommended drill** (filled; first next step) · **See my progress** (outlined → `/progress/:roleId`) · text **Back to role**.

### 5.7 Progress `/progress` and `/progress/:roleId`

* Role switcher (chips) if more than one role tried; empty state "You have not rehearsed yet" + **Browse roles**.
* **Ramp Map:** header "Your first 90 days, rehearsed". Big summary "3 of 6 milestones rehearsed" with a segmented bar. Vertical list of milestones with typical-week chip, state chip (Achieved/Next/Planned), covering mission/drill name. `next` has a **Start** action (→ drill/mission); `planned` has no action.
* **Target versus achieved:** per skill row: self-rating marker, latest anchors bar, target line, "N of 2 fresh variants". Footer note "Mastery counts after two fresh variants."
* **Skill history:** small sparkline per skill (SVG), tooltip with date + mission.
* **Badges:** grid of earned badges (icon, title, description, "Earned on {date}", link **See evidence** → debrief transcript drawer at `evidenceSeq`). Badges are always attached to evidence. Empty: "Badges appear when you show a behaviour twice."
* **Streak:** "3-day practice streak" (text + small calendar dots). Never compare with others.
* **Next best drill** card → starts it.
* **Attempts list:** mission/drill title, date, status; row action **Open report** (→ debrief) or **Resume** (→ workspace).

### 5.8 Cohort console `/cohort`

* Two tabs: **I lead a group** and **I am joining a group**.
* Lead: **Create cohort** (dialog: name; `POST /cohorts`) → cohort card with name, member count, join **code** (mono), **Copy code**, **Copy join link** (`/join/CODE`). Select a cohort → **Insights** panel from `GET /cohorts/:id/insights`: participation counters; skill patterns as horizontal bars "62% showed escalation at target (n=11)"; trap patterns; `dataSource` chip **Live** or **Seeded demo data** (amber). If `suppressed`: illustration + "Patterns appear when 5 or more members who agreed to share have finished a mission." No numbers shown. Persistent note: `note` ("Individual scores are never shown…").
* Join: code field → `POST /cohorts/join` → success card "You joined {name}. They can only see anonymous group patterns, and only if you allow it in Privacy." with **Open privacy settings** → `/privacy` and **Back to roles**.
* `/join/:code` auto-calls join after guest session + shows the same success card or an error card with Retry.

### 5.9 Privacy centre `/privacy`

Sections: **What we store** (plain list) · **Who sees what** (table: You · Your cohort lead · Anyone else) · **Your choices** (three toggles bound to `PUT /me/consent`; `age18` and `storeWork` disabled with explanation "Needed to run a rehearsal; delete your data to withdraw") · **Export my data** (`GET /me/export` → downloads `ayden-export.json`) · **Delete my data** (danger zone; confirm dialog typing "DELETE"; `DELETE /me` → `/`) · **How the AI is used** (models and logging statement) · **Security** summary linking `/how-it-works#security`. No dark patterns.

### 5.10 How it works `/how-it-works` (for judges)

Anchored sections with a sticky in-page nav: **The loop** · **Architecture** (`#engine`) · **Google stack** · **Scoring** (`#scoring`) · **Security** (`#security`) · **Built vs planned** · **Live status**.
* **Architecture diagram (hand-built SVG, light/dark aware):** Browser → Cloud Run (API + engine) → Gemini API (Hydrogen colleague agents, Argon judge/weaver, embeddings) · Firestore · Secret Manager · Cloud Logging · Google's code sandbox · (BigQuery, planned). Arrows labelled "proposes", "validates", "events". Caption: "The model proposes. The engine decides."
* **Google stack table** fed by `GET /system/status.googleServices` (name, state chip Live/Fallback/Planned, detail) and `models[]`.
* **Live status:** counters (missions started/completed, model calls, fallbacks, quotes verified/rejected) from `/system/status`, refreshed every 15 s. No fake numbers: if the call fails show "Status unavailable".
* **Scoring** explainer: signals first, then a quote-bound judge, server verifies every quote, two judge runs, "uncertain" when they disagree.
* **Security** explainer table (use the one in `03_BACKEND_PLAN.md` §8 but only rows the status endpoint marks live/built).
* **Built vs planned:** static two-column list kept honest in `content.ts`.

### 5.11 Other

* **404:** "That page does not exist." **Go home** (→ `/`) and **Browse roles**.
* **Global error boundary:** friendly card + **Reload** + **Copy diagnostics**.
* **Session expired (401):** inline dialog "Your session ended" → **Start a new session** (`POST /session/guest`) and return to `/roles` (progress on the old guest is not recoverable; say so).

---

## 6. State catalogue (implement as reusable components)

`<Skeleton>` per layout · `<EmptyState icon title body action>` · `<ErrorState error retry>` (maps `ApiError.code` to plain language) · `<Banner kind="info|warning|error">` (runtime fallback, safety notes, seeded data) · `<Snackbar>` · `<PendingDots>` · `<ConfirmDialog>`.

Error code copy: `consent_required` "We need your consent first." · `attempt_cap` "You have used both attempts on this variant. Try a drill or a new variant." · `rate_limited` "Too many requests. Try again in {n} s." · `model_unavailable` "The AI is unavailable, so the team is running from a script." · `unauthenticated` "Your session ended." · others generic "Something went wrong. Try again."

## 7. Accessibility and language

* Semantic landmarks (`header`, `nav`, `main`, `aside`), skip-to-content link, focus management on route change (focus the page `h1`).
* Chat list `role="log"` with `aria-live="polite"`; do not announce your own messages twice.
* Colour is never the only signal (icons + text on chips).
* Keyboard shortcuts in the workspace: `Ctrl/Cmd+Enter` send/submit, `Esc` closes drawers, `Alt+1/2/3` focus Chat/Work/Checks, `?` opens the shortcuts dialog.
* **Languages:** English and Hindi for **UI chrome only** (navigation, buttons, labels, errors, onboarding, privacy). Hindi strings are written carefully but are **not reviewed by a native editor**; show nothing claiming they are. Mission content stays English in v1; show a small note under the language toggle on the role page: "Missions are in English for now."
* Respect system text size; test at 200% zoom.

## 8. API client and mock mode

Implement exactly as `02_API_CONTRACT.md` §5. One exported function per endpoint; central `request()` with `credentials:'include'`, JSON parsing, `ApiError` mapping, 401 handling, and request ids in dev logs. `useMission(missionId)` hook handles initial load, `act()` with auto-incremented `clientSeq`, retry with the **same** `clientSeq`, polling when `pending`, optimistic append of the learner's own message (replaced by the server event with the same text), and de-duplication by `seq`.
Dev-only **Mock panel** (hidden in production builds): force slow model, fallback mode, any error code, report processing delay.

## 9. Gamification (tasteful, never competitive)

Milestones on the Ramp Map · badges tied to evidence · "N of 2 fresh variants" mastery pips · streak in days · target vs achieved bars · gentle completion confetti-free feedback (a check animation and a calm success card). **Do not build:** points, XP, levels, leaderboards, rankings, "top X%", sharing of scores, or any comparison to other users.

## 10. Content file

`content.ts` exports: landing copy, loop cards, FAQ, "Built vs planned" lists, Hindi strings, and `stats: {text, source, url, verified}[]`. Backend/founders will flip `verified` after opening the sources. Until then no number is displayed.

## 11. Build order (suggested; ship in this order)

1. Tokens, base components, shell, routes, API client + mock layer + fixtures (all five roles).
2. Landing, Roles, Role detail, Onboarding (so judges can enter).
3. **Workspace** (the hard one): conversation, items, editor, artifacts, checks, trace, progression, states.
4. Debrief, Progress, Drills (same workspace).
5. Privacy, How it works, Cohort console.
6. Polish: dark mode, Hindi strings, responsive pass, a11y pass, empty/error/slow states.
7. Switch to live when the backend URL arrives; fix integration issues; run QA matrix on a phone over mobile data.

## 12. QA click-through matrix (you must tick every row before saying "done")

| # | Screen | Control | Expected |
|---|---|---|---|
| 1 | Landing | Try the demo | → `/demo` → onboarding for SWE with consent card |
| 2 | Landing | See how it works | → `/how-it-works` |
| 3 | Landing | Each ready role card | → `/roles/:id`; planned cards not clickable |
| 4 | Header | Roles / My progress / How it works / Privacy | correct routes; active state |
| 5 | Header | EN/हिं toggle | all chrome strings switch; persists on reload |
| 6 | Header | Theme toggle | light/dark/system; persists |
| 7 | Header | Account menu: Edit name | dialog; `PATCH /me`; name updates |
| 8 | Header | Account menu: Delete my data | confirm; `DELETE /me`; → `/` |
| 9 | Roles | Start on a card | → role detail |
| 10 | Role detail | ← back | → `/roles` |
| 11 | Role detail | Tabs (4) | keyboard arrows + click; content correct |
| 12 | Role detail | Full day option | disabled, labelled Planned |
| 13 | Role detail | Start rehearsal | → onboarding or mission; Resume if exists |
| 14 | Onboarding | Back/Next at each step; step 1 back | → previous step / role detail |
| 15 | Onboarding | Consent checkboxes | Start disabled until required boxes ticked |
| 16 | Onboarding | Start rehearsal | consent + onboarding + mission calls → `/mission/:id` |
| 17 | Workspace | ✕ Exit | confirm; Exit → role detail; Resume stays |
| 18 | Workspace | Click each person | thread switches; unread dot clears |
| 19 | Workspace | Click each item type | viewer correct (file/doc/ticket/table/record) |
| 20 | Workspace | Edit file | autosave indicator; Reset file restores |
| 21 | Workspace | Run checks | results card + Checks tab; hidden names masked |
| 22 | Workspace | Send message (Enter / button / quick reply) | appears; reply arrives or typing indicator; poll on pending |
| 23 | Workspace | Review card → Open file | editor opens at the line |
| 24 | Workspace | Submit artifact | read-only + ✓; objectives checklist updates |
| 25 | Workspace | Continue to next beat | enabled only if `canAdvance`; disabled reason visible |
| 26 | Workspace | Objectives popover | shows objective, artifacts, hint (drills) |
| 27 | Workspace | Engine trace | opens/closes with Esc; filters work; rejected entries show reasons |
| 28 | Workspace | ⋯ menu: New variant / Report a problem / Shortcuts | each works or is disabled with reason |
| 29 | Workspace | Fallback banner | appears for `scripted`/`cached` and tags lines |
| 30 | Workspace | Refresh page | state fully restored |
| 31 | Workspace | Finish and see my report | confirm → judging → debrief |
| 32 | Debrief | processing → ready | friendly waiting screen then report |
| 33 | Debrief | Evidence "View in conversation" | drawer opens at the quoted event |
| 34 | Debrief | Start drill | → new mission with hinted scaffold |
| 35 | Debrief | Copy growth summary | dialog; copy; snackbar |
| 36 | Debrief | See my progress / Back to role | correct routes |
| 37 | Progress | Ramp Map next → Start | starts drill/mission |
| 38 | Progress | Badge → See evidence | opens transcript drawer |
| 39 | Progress | Attempts → Open report / Resume | correct routes |
| 40 | Cohort | Create / copy code / copy link | works; insights suppressed state when < 5 |
| 41 | Cohort | Join by code | success card; error for bad code |
| 42 | Privacy | Toggle consent | `PUT /me/consent`; required ones disabled |
| 43 | Privacy | Export | downloads JSON |
| 44 | Privacy | Delete | typed confirmation; → `/` |
| 45 | How it works | Section nav, status counters, diagram | anchors scroll; counters real or "unavailable" |
| 46 | Any | 404, session expired, API error, offline | friendly states with a way out |
| 47 | Any | Keyboard only through the whole demo path | no traps, visible focus |
| 48 | Any | 360 px phone width | no horizontal scroll; bottom nav in workspace |

## 13. Definition of done and handoff

* All rows of §12 pass in **live mode** against the backend URL on a phone over mobile data.
* `npm run build` produces `apps/web/dist` with no console errors; Lighthouse accessibility ≥ 95 on landing and roles.
* No `console.log`, no `TODO`, no unused routes, no placeholder text, no lorem ipsum.
* Hand over: a short `apps/web/README.md` (how to run in mock and live), a list of any contract questions, and a screenshot set (landing, role page, workspace, debrief, progress) for the deck.
