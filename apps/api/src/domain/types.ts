import type {
  ArtifactSpec,
  CheckResult,
  Channel,
  Cohort,
  Consent,
  EventKind,
  MissionEvent,
  Onboarding,
  RampMilestone,
  Report,
  RoleId,
  RuntimeMode,
  SkillDef,
  TraceEntry,
  WorkItem,
  Lang,
} from "@ayden/contract";

export type Vars = Record<string, string>;

/* ───────────── declarative conditions ───────────── */

export type Cond =
  | { t: "always" }
  | { t: "artifact"; id: string }
  | { t: "messaged"; to?: string; n?: number; scope?: "beat" | "all" }
  | { t: "opened"; item: string }
  | { t: "saved"; item?: string }
  | { t: "checks" }
  | { t: "flag"; key: string }
  | { t: "any"; of: Cond[] }
  | { t: "all"; of: Cond[] };

export interface ScriptedEvent {
  from: string;
  to?: string;
  channel: Channel;
  body: string;
  kind?: EventKind;
  quickReplies?: string[];
  severity?: "blocker" | "suggestion" | "nit" | "question";
  commentFile?: string;
  commentLine?: number;
  /** Replace a work item (e.g. new vitals arrive). */
  itemUpdate?: WorkItem;
  /** Ask the person's agent to restate this in their own voice (live mode). Must keep every `mustContain`. */
  rephrase?: { personId: string; mustContain: string[] };
  setFlags?: Record<string, boolean | number | string>;
  clockJump?: number;
}

export interface BeatDef {
  title: string;
  objective: string;
  hint?: string;
  onEnter?: ScriptedEvent[] | ((ctx: EngineCtx) => ScriptedEvent[]);
  advanceWhen: Cond;
}

export interface TriggerDef {
  id: string;
  beat?: number;
  /** fires after the learner first messages this person (in the optional beat) */
  messagedFirst?: string;
  cond?: Cond;
  events: ScriptedEvent[];
  /** if true the agent's own reply to that message is skipped */
  replacesReply?: boolean;
}

export interface ReplyRule {
  match: RegExp;
  text: string;
  quickReplies?: string[];
  setFlags?: Record<string, boolean | number | string>;
}

export interface Fact {
  id: string;
  text: string;
  knownBy: string[];
  /** If a persona who does not know this fact writes something matching, the engine rejects the reply. */
  leak: RegExp[];
}

export interface PersonDef {
  id: string;
  name: string;
  title: string;
  hue: number;
  kind: "agent" | "script";
  /** Persona description for the live agent: goal, voice, boundaries. */
  persona: string;
  /** Generic scripted lines used if no ReplyRule matches (rotated). */
  defaultLines: string[];
  modelLabel?: string;
  /** The colleague speaks this language (Cloud Translation code, e.g. "it"). Replies and scripted lines are in it. */
  language?: string;
  languageName?: string;
}

/* ───────────── anchors and scoring ───────────── */

export interface AnchorHit {
  met: boolean;
  seq?: number;
  quote?: string;
  note?: string;
}

export interface ScoreCtx {
  events: MissionEvent[];
  session: Session;
  vars: Vars;
  files: Record<string, string>;
  artifacts: Record<string, string>;
  finalChecks: CheckResult[] | null;
  /** all events authored by the learner, convenience */
  learner: MissionEvent[];
}

export interface AnchorDef {
  id: string;
  skillId: string;
  text: string;
  kind: "code" | "judge";
  /** Deterministic evaluation (kind 'code'), or the keyword heuristic used when the AI judge is unavailable (kind 'judge'). */
  eval: (ctx: ScoreCtx) => AnchorHit;
  /** Plain-language instruction for the AI judge (kind 'judge'). */
  judgeInstruction?: string;
}

export interface TrapDef {
  id: string;
  label: string;
  /** true if the learner fell into the trap */
  missed: (ctx: ScoreCtx) => boolean;
}

/* ───────────── builds, packs ───────────── */

export interface EngineCtx {
  session: Session;
  vars: Vars;
  events: MissionEvent[];
  files: Record<string, string>;
  artifacts: Record<string, string>;
  lastChecks: CheckResult[] | null;
}

export interface SubmitCtx extends EngineCtx {
  artifactId: string;
  content: string;
  runChecks: () => Promise<{ results: CheckResult[]; mode: "sandbox" | "static" | "local" }>;
}

export interface SubmitReaction {
  events: ScriptedEvent[];
  checks?: CheckResult[];
  setFlags?: Record<string, boolean | number | string>;
}

export interface RunChecksCtx extends EngineCtx {
  runner: (program: string, timeoutMs?: number) => Promise<string | null>;
}

export interface MissionBuild {
  title: string;
  company: string;
  /** drill hint shown in the objectives card (first-time scaffold) */
  hint?: string;
  clockStart: { day: string; minute: number }; // minute of day, e.g. 570 = 09:30
  clockTotal: number;
  people: PersonDef[];
  items: WorkItem[];
  artifacts: Omit<ArtifactSpec, "submitted">[];
  beats: BeatDef[];
  triggers: TriggerDef[];
  replies: Record<string, ReplyRule[]>;
  facts: Fact[];
  /** per-action sim minute costs */
  cost: { message: number; open: number; checks: number; submit: number; advance: number };
  onSubmit?: (ctx: SubmitCtx) => Promise<SubmitReaction>;
  runChecks?: (ctx: RunChecksCtx) => Promise<{ results: CheckResult[]; mode: "sandbox" | "static" | "local" }>;
  /** Called at finish to compute final checks used for scoring. */
  finalChecks?: (ctx: RunChecksCtx) => Promise<CheckResult[] | null>;
  /** commitments detector enabled */
  detectCommitments?: boolean;
  /** skills measured in this build (drills measure one) */
  activeSkills: string[];
  traps: TrapDef[];
  /** extra system context lines for the judge (scenario summary) */
  judgeContext: string;
  /** Learner messages that need role-specific flag handling (e.g. self-approval detection). */
  onLearnerMessage?: (args: { text: string; to: string; session: Session; events: MissionEvent[] }) => Record<string, boolean | number | string> | void;
}

export interface MissionDef {
  id: string;
  title: string;
  kind: "mission" | "drill";
  estMinutes: number;
  description: string;
  skillIds: string[];
  variants: number;
  varsFor: (seed: string, variantIndex: number) => Vars;
  build: (args: { variantIndex: number; vars: Vars; drill?: DrillDef }) => MissionBuild;
}

export interface DrillDef {
  id: string;
  skillId: string;
  title: string;
  description: string;
  estMinutes: number;
  missionId: string;
  /** beat indices to keep (a drill is a shorter slice of the mission with a different variant) */
  beats: number[];
  hint: string;
  descriptor: string;
  /** start with the fix already applied (used by review-focused drills) */
  startFixed?: boolean;
}

export interface AnchorLite {
  id: string;
  skillId: string;
}

export interface SkillMeta extends Omit<SkillDef, "anchors"> {
  badge: string;
}

export interface RolePack {
  id: RoleId;
  status: "ready" | "planned";
  title: string;
  tagline: string;
  domain: string;
  company: string;
  estMinutes: number;
  icon: string;
  accentHex: string;
  description: string;
  whatYouWillPractise: string[];
  safetyNote?: string;
  skills: SkillMeta[];
  anchors: AnchorDef[];
  cast: { id: string; name: string; title: string; kind: "agent" | "script"; modelLabel?: string; blurb: string }[];
  rampMap: (Omit<RampMilestone, "state"> & { requires?: string[] })[];
  missions: MissionDef[];
  drills: DrillDef[];
}

/* ───────────── persisted records ───────────── */

export interface UserRec {
  id: string;
  displayName: string;
  isGuest: boolean;
  language: Lang;
  consent: Consent | null;
  onboardings: Onboarding[];
  createdAt: string;
}

export interface Session {
  id: string;
  uid: string;
  roleId: RoleId;
  defId: string;
  kind: "mission" | "drill";
  drillId?: string;
  seed: string;
  variantIndex: number;
  vars: Vars;
  status: "active" | "judging" | "done";
  beat: number;
  simMinute: number;
  seq: number;
  attempt: { number: number; max: number };
  runtimeMode: RuntimeMode;
  fallbackReason?: string;
  flags: Record<string, boolean | number | string>;
  fired: string[];
  files: Record<string, string>;
  originalFiles: Record<string, string>;
  itemOverrides: Record<string, WorkItem>;
  openedAt: Record<string, number>;
  tickSub: number;
  firstSaveSeq: number | null;
  lastSaveSeq: number | null;
  lastCheckSeq: number | null;
  saved: string[];
  msgTo: Record<string, number>;
  beatMsgTo: Record<string, number>;
  checksRuns: number;
  checksBeforeFirstSubmit: number;
  submittedCount: number;
  artifacts: Record<string, { content: string; at: string; seq: number }>;
  lastChecks: CheckResult[] | null;
  commitments: { text: string; personId: string; atMinute: number; seq: number }[];
  startedAt: string;
  reportId?: string;
  actCache: Record<number, unknown>;
}

export interface StoredReport extends Report {
  uid: string;
  defId: string;
  kind: "mission" | "drill";
  variantKey: string;
  drillId?: string;
  traps: { id: string; label: string; missed: boolean }[];
  tested: string[];
  skillRatios: Record<string, number>;
  /** Set only when the learner chose to share this report. Deleting it switches the public link off. */
  share?: { token: string; name: string; createdAt: string };
}

/** A tester's feedback. The photo (small JPEG data URL) and name are kept only when showPublicly is true. */
export interface FeedbackRec {
  id: string;
  uid: string;
  createdAt: string;
  roleId?: RoleId;
  missionId?: string;
  /** 1 to 5 stars */
  rating: number;
  /** 0 to 10, would you recommend Ayden */
  recommend: number;
  comment?: string;
  name?: string;
  college?: string;
  photo?: string;
  showPublicly: boolean;
}

export interface CohortRec extends Omit<Cohort, "role" | "memberCount"> {
  members: string[];
}

export type { TraceEntry };
