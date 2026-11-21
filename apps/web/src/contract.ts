/**
 * AYDEN API CONTRACT v1.0  (source of truth, shared by apps/web and apps/api)
 *
 * Rules
 * - Pure TypeScript types. No runtime imports. Copy to packages/contract/src/index.ts
 *   (and to apps/web/src/contract.ts if you work outside the monorepo).
 * - The backend validates every response against zod schemas that mirror these types.
 * - Frontend: NEVER invent fields. If you need one, write it in CONTRACT_CHANGES.md and tell Tanish.
 * - Backend never leaks hidden truth (answers, hidden test names, ground-truth numbers) before status === 'done'.
 * - All times are ISO-8601 strings in UTC. All ids are opaque strings.
 * - Base path: /api/v1  (same origin as the web app in production; Vite proxy in dev).
 */

export const API_BASE = "/api/v1";

/* ───────────── primitives ───────────── */

export type ISODate = string;
export type RoleId = "software-engineer" | "tech-consulting" | "nurse" | "banking-ops" | "data-analyst";
export type SkillId = string; // defined per role in RoleDetail.skills (never hardcode in UI)
export type PersonId = string;
export type Lang = "en" | "hi" | "bn" | "te" | "mr" | "ta" | "gu" | "ur" | "kn" | "ml" | "or" | "pa" | "as";

/** How the server is currently producing agent replies. UI must show a banner when not 'live'. */
export type RuntimeMode = "live" | "scripted" | "cached";

export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "conflict"
  | "attempt_cap"
  | "consent_required"
  | "model_unavailable"
  | "internal";

/** Every non-2xx response has this body. */
export interface ApiError {
  error: { code: ErrorCode; message: string; retryAfterMs?: number; details?: unknown };
}

/* ───────────── session, profile, consent ───────────── */

export interface Consent {
  age18: boolean; // required to start any mission
  storeWork: boolean; // required: we store your messages/artifacts so the report can quote them
  shareAnonymousPatterns: boolean; // optional: lets cohort owners see anonymous patterns (k >= 5)
  acceptedAt: ISODate;
}

export type Experience = "none" | "some" | "internship";

export interface Onboarding {
  roleId: RoleId;
  experience: Experience;
  /** 1 (not at all confident) .. 5 (very confident), one entry per SkillDef.id of the role */
  selfRatings: Record<SkillId, 1 | 2 | 3 | 4 | 5>;
  completedAt: ISODate;
}

export interface Me {
  userId: string;
  displayName: string; // guest: "Guest 4F2A" until the user edits it
  isGuest: boolean;
  language: Lang;
  consent: Consent | null;
  onboardings: Onboarding[]; // one per role tried
  cohorts: Cohort[];
  counts: { missionsStarted: number; missionsCompleted: number; drillsCompleted: number };
}

export interface CreateGuestResponse {
  me: Me; // session cookie "ayden_sid" is set httpOnly by the server
}

export interface UpdateMeRequest {
  displayName?: string;
  language?: Lang;
}

/* ───────────── roles ───────────── */

export interface RoleSummary {
  id: RoleId;
  title: string; // "Software Engineer (Intern / Graduate)"
  tagline: string;
  domain: string; // "Technology" | "Healthcare" | "Finance" | "Consulting" | "Data"
  status: "ready" | "planned"; // 'planned' roles are shown but NOT clickable into a mission
  company: string; // fictional company the mission happens in
  estMinutes: number;
  skillCount: number;
  icon: string; // Material Symbols name, e.g. "terminal", "stethoscope", "account_balance", "insights", "query_stats"
  accentHex: string; // role accent, e.g. "#1a73e8"
}

export interface SkillDef {
  id: SkillId;
  label: string; // "Verify before you ship"
  description: string; // plain-language, 1-2 sentences
  anchors: string[]; // observable behaviours the report checks, e.g. "Ran the checks before submitting"
  targetLevel: number; // how many anchors count as 'at target' (e.g. 3)
}

export interface PersonPreview {
  id: PersonId;
  name: string;
  title: string; // "Engineering Manager"
  kind: "agent" | "script";
  modelLabel?: string; // e.g. "Gemini 4 Hydrogen", shown on the role page cast list
  blurb: string;
}

export interface RampMilestone {
  id: string;
  /** Typical week of a real job when this milestone happens (1, 2, 4, 8, 12). Sourced to public 30-60-90 plans. */
  typicalWeek: number;
  title: string; // "Ship your first reviewed change"
  description: string;
  skillIds: SkillId[];
  /** 'achieved' only when the user demonstrated it in a mission; 'planned' is NOT clickable. */
  state: "achieved" | "next" | "planned";
  coveredBy: { kind: "mission" | "drill"; id: string } | null;
}

export interface MissionSummary {
  id: string;
  title: string;
  kind: "mission" | "drill";
  estMinutes: number;
  description: string;
  skillIds: SkillId[];
}

export interface RoleDetail extends RoleSummary {
  description: string;
  whatYouWillPractise: string[];
  skills: SkillDef[];
  cast: PersonPreview[];
  missions: MissionSummary[]; // missions the user can start now (kind 'mission')
  rampMap: RampMilestone[]; // user-specific states if signed in
  safetyNote?: string; // e.g. nurse: "Practice scenario. Never choose drugs or doses. Not clinically validated."
}

/* ───────────── missions (the workspace) ───────────── */

export interface CreateMissionRequest {
  roleId: RoleId;
  missionId?: string; // default: role's primary mission
  drillId?: string; // if set, creates a drill session (kind 'drill')
  mode: "quick" | "full"; // quick ≈ 20 min, full ≈ 60-90 min with more beats
  reseed?: boolean; // judge/demo button: "New variant" -> different names, numbers, trap emphasis
}

export interface BeatInfo {
  index: number; // 0-based
  total: number;
  title: string; // "Beat 2 of 4 · Fix the bug"
  objective: string; // plain-language objective shown in the Objectives card
  hint?: string; // only present for drills with scaffold 'hinted'
}

export interface SimClock {
  minute: number; // simulated minutes since mission start (turn-based, not real time)
  label: string; // "Wed 10:40"
  minutesTotal: number; // end of the mission
}

export interface Person {
  id: PersonId;
  name: string;
  title: string;
  kind: "agent" | "script";
  avatarHue: number; // 0-359, UI derives avatar colour
  presence: "online" | "busy" | "away";
  modelLabel?: string; // shown in Engine Trace and on hover
  /** Set when this colleague speaks another language (Cloud Translation bridges the gap). */
  language?: string;
  languageName?: string;
}

export type WorkItem =
  | { id: string; type: "file"; title: string; path: string; language: "python" | "javascript" | "sql" | "markdown" | "text"; content: string; editable: boolean }
  | { id: string; type: "doc"; title: string; markdown: string }
  | { id: string; type: "ticket"; title: string; key: string; status: string; priority: "low" | "medium" | "high" | "urgent"; description: string }
  | { id: string; type: "table"; title: string; columns: string[]; rows: (string | number)[][]; note?: string }
  | { id: string; type: "record"; title: string; fields: { label: string; value: string }[]; note?: string };

export interface ArtifactSpec {
  id: string;
  kind: "text" | "commit_message" | "pr_description" | "sbar" | "memo" | "email" | "sql" | "code";
  title: string; // "Commit message"
  instructions: string; // plain language
  template?: string; // optional prefilled skeleton
  required: boolean;
  maxChars: number;
  submitted: boolean;
}

export interface RuntimeInfo {
  mode: RuntimeMode;
  agentModels: { personId: PersonId | "judge" | "director" | "tester"; model: string }[];
  fallbackReason?: string; // present when mode !== 'live'
}

export interface MissionState {
  id: string;
  roleId: RoleId;
  missionId: string;
  kind: "mission" | "drill";
  title: string;
  company: string;
  status: "active" | "judging" | "done";
  beat: BeatInfo;
  clock: SimClock;
  people: Person[];
  items: WorkItem[];
  artifacts: ArtifactSpec[];
  attempt: { number: number; max: number };
  runtime: RuntimeInfo;
  seed: string; // shown as "Variant K7F2" so judges can see reseeding works
  variantLabel: string;
  startedAt: ISODate;
  lastSeq: number;
  canAdvance: boolean;
  canFinish: boolean;
}

export type EventKind = "message" | "system" | "beat" | "artifact" | "review_comment" | "check_result" | "consequence" | "notice";
export type Channel = "chat" | "email" | "tickets" | "review" | "checks" | "call" | "system";

export interface CheckResult {
  id: string;
  name: string; // hidden checks show as "Hidden check 3" until the report
  kind: "test" | "lint" | "convention" | "rule";
  passed: boolean;
  message?: string;
  hidden: boolean;
}

export interface MissionEvent {
  seq: number; // strictly increasing per mission, starts at 1
  at: ISODate;
  simMinute: number;
  kind: EventKind;
  channel: Channel;
  from: PersonId | "you" | "system";
  to?: PersonId | "you";
  body: string; // markdown-lite: **bold**, `code`, lists, ```blocks```
  replyTo?: number;
  source: "learner" | "script" | "agent" | "engine";
  /** Set when a scripted/cached line replaced a live model reply. UI shows a small "scripted" tag. */
  fallback?: boolean;
  meta?: {
    quickReplies?: string[];
    commentFile?: string;
    commentLine?: number;
    severity?: "blocker" | "suggestion" | "nit" | "question";
    checks?: CheckResult[];
    consequenceOfSeq?: number;
    artifactId?: string;
    itemId?: string;
  };
}

export type ActRequest = { clientSeq: number } & (
  | { kind: "message"; to: PersonId; channel: Channel; text: string }
  | { kind: "open_item"; itemId: string }
  | { kind: "save_file"; itemId: string; content: string }
  | { kind: "run_checks"; itemIds?: string[] }
  | { kind: "submit_artifact"; artifactId: string; content: string }
  | { kind: "advance" }
  | { kind: "finish" }
);

/** One row of the visible Engine Trace panel: proves the model proposes and the engine disposes. */
export interface TraceEntry {
  id: string;
  seq: number | null;
  at: ISODate;
  actor: string; // "Priya (Gemini 4 Hydrogen)" | "Engine" | "Judge"
  model?: string;
  type: "proposal" | "validation" | "signal" | "fallback" | "check" | "consequence";
  summary: string; // "Proposed tool reply(chat, ...)" | "Rejected: references fact the persona does not know"
  verdict?: "accepted" | "rejected";
  reason?: string;
  latencyMs?: number;
}

export interface StateDelta {
  beat: BeatInfo;
  clock: SimClock;
  status: MissionState["status"];
  lastSeq: number;
  canAdvance: boolean;
  canFinish: boolean;
  attempt: MissionState["attempt"];
  artifacts: ArtifactSpec[];
  /** Only items that changed (e.g. a file the learner saved, a new ticket revealed). */
  changedItems?: WorkItem[];
}

export interface ActResponse {
  accepted: boolean;
  rejectedReason?: string; // plain language, show in a snackbar
  events: MissionEvent[]; // learner's own event first, then agent replies that finished in time
  delta: StateDelta;
  /** true if some agent replies are still being generated -> poll GET events?since=lastSeq every 1500 ms */
  pending: boolean;
  trace: TraceEntry[];
}

export interface EventsResponse {
  events: MissionEvent[];
  delta: StateDelta;
  pending: boolean;
  trace: TraceEntry[];
}

/* ───────────── report = the Skill X-ray ───────────── */

export interface Evidence {
  eventSeq: number;
  quote: string; // verbatim from the event body; server rejects quotes that are not substrings
  note: string; // plain language: what this shows
  tone: "good" | "miss";
  verifiedBySystem: boolean;
}

export interface SignalHit {
  id: string;
  anchor: string; // the anchor text from SkillDef.anchors
  met: boolean;
  source: "code" | "judge"; // 'code' = deterministic signal, 'judge' = quote-bound model judge
  eventSeq?: number;
}

export interface SkillResult {
  skillId: SkillId;
  label: string;
  selfRating: number | null; // 1-5 from onboarding
  anchorsMet: number;
  anchorsTotal: number;
  target: number; // anchors needed to be 'strong'
  state: "strong" | "developing" | "gap" | "uncertain";
  confidenceGap: "overestimated" | "aligned" | "underestimated" | null;
  signals: SignalHit[];
  evidence: Evidence[];
  missedFact?: string; // the hidden fact the learner did not find, revealed only in the report
}

export interface ConsequenceNote {
  eventSeq: number;
  title: string; // "Your 10 AM promise came back on Day 2"
  detail: string;
}

export interface NextStep {
  drillId: string;
  skillId: SkillId;
  title: string;
  why: string; // references the learner's own moment
  estMinutes: number;
  scaffold: "hinted" | "unhinted";
}

export interface IntegrityInfo {
  judgeModel: string;
  mode: RuntimeMode;
  quotesVerified: number;
  quotesRejected: number;
  uncertainSkills: SkillId[];
  notes: string[]; // plain language, e.g. "Scores are formative. Not validated against job performance."
}

export interface Report {
  id: string;
  missionId: string;
  roleId: RoleId;
  createdAt: ISODate;
  status: "processing" | "ready" | "failed";
  headline: string; // "Strong on verifying your work. Next: escalate earlier."
  summary: string;
  skills: SkillResult[];
  keyMoments: { eventSeq: number; quote: string; why: string; skillId: SkillId }[];
  consequences: ConsequenceNote[];
  nextSteps: NextStep[];
  integrity: IntegrityInfo;
  privacyNote: string; // "Only you can see this report."
  shareSummary: string; // opt-in, positive-only text the learner may copy
}

/* ───────────── progress, milestones, badges ───────────── */

export interface Badge {
  id: string;
  title: string; // "Verified before shipping"
  description: string;
  skillId: SkillId;
  roleId: RoleId;
  earnedAt: ISODate;
  missionId: string;
  evidenceSeq?: number;
}

export interface SkillProgress {
  skillId: SkillId;
  label: string;
  selfRating: number | null;
  target: number;
  latestAnchorsMet: number;
  anchorsTotal: number;
  /** Mastery needs two fresh variants. Show this as "1 of 2 fresh variants". */
  freshVariantsDemonstrated: number;
  history: { missionId: string; at: ISODate; anchorsMet: number; kind: "mission" | "drill" }[];
}

export interface Progress {
  roleId: RoleId;
  skills: SkillProgress[];
  rampMap: RampMilestone[];
  milestonesAchieved: number;
  milestonesTotal: number;
  streakDays: number;
  badges: Badge[];
  nextBestDrill: NextStep | null;
  attempts: { missionId: string; title: string; kind: "mission" | "drill"; at: ISODate; status: MissionState["status"]; reportId?: string }[];
}

/* ───────────── cohorts (college / employer view) ───────────── */

export interface Cohort {
  id: string;
  name: string;
  code: string; // join code, e.g. "SNU-7K2"
  ownerId: string;
  createdAt: ISODate;
  memberCount: number;
  role: "owner" | "member";
}

export interface CreateCohortRequest { name: string }
export interface JoinCohortRequest { code: string }

export interface CohortInsights {
  cohortId: string;
  minGroupSize: 5;
  /** If fewer than 5 consenting members completed a mission, patterns are suppressed and this is true. */
  suppressed: boolean;
  participation: { members: number; started: number; completed: number };
  skillPatterns: { roleId: RoleId; skillId: SkillId; label: string; pctAtTarget: number; n: number }[];
  trapPatterns: { trapId: string; label: string; pctMissed: number; n: number }[];
  dataSource: "live" | "seeded-demo"; // UI must show this label
  note: string; // "Individual scores are never shown to cohort owners."
}

/* ───────────── privacy centre ───────────── */

export interface UpdateConsentRequest { age18: boolean; storeWork: boolean; shareAnonymousPatterns: boolean }
export interface ExportResponse { generatedAt: ISODate; data: unknown } // JSON the browser downloads
export interface DeleteMeResponse { deleted: true }

/* ───────────── system status (powers /how-it-works honestly) ───────────── */

export type ServiceState = "live" | "fallback" | "planned";

export interface SystemStatus {
  version: string;
  commit?: string;
  region: string;
  runtime: RuntimeInfo["mode"];
  models: { role: string; id: string; purpose: string }[];
  googleServices: { name: string; state: ServiceState; detail: string }[];
  /** Which optional Google features are switched on for this deployment. */
  features?: { badgeArt: boolean; translate: boolean; speech: boolean };
  counters: { missionsStarted: number; missionsCompleted: number; modelCalls: number; fallbacks: number; quotesVerified: number; quotesRejected: number; redactions?: number; badgeArt?: number; translations?: number; speech?: number };
}

/* ───────────── drills ───────────── */

export interface DrillList { drills: NextStep[] }
