import type {
  ArtifactSpec, CheckResult, EventKind, Channel, MissionEvent, Person, RampMilestone, RoleId,
  RoleSummary, SkillDef, PersonPreview, TraceEntry, WorkItem, ActResponse, MissionSummary,
} from "../../contract";

/** A line the mock engine can emit as an event. Strings may contain {{var}} placeholders. */
export interface Line {
  from: string; // person id | "system" | "you"
  body: string;
  kind?: EventKind;
  channel?: Channel;
  meta?: MissionEvent["meta"];
  /** simulated minutes that pass before this line */
  wait?: number;
  /** server-side change to a work item that ships in delta.changedItems (e.g. new observations) */
  updateItem?: { id: string; patch: Record<string, unknown> };
}

export interface MockMission {
  id: string;
  userId: string;
  roleId: RoleId;
  missionDefId: string;
  drillId?: string;
  kind: "mission" | "drill";
  seed: string;
  variantIndex: number;
  beatIndex: number;
  minute: number;
  status: "active" | "judging" | "done";
  events: MissionEvent[];
  trace: TraceEntry[];
  files: Record<string, string>;
  submitted: Record<string, string>;
  submittedSeq: Record<string, number>;
  opened: string[];
  checksRuns: number;
  lastChecks?: CheckResult[];
  checkReveal: Record<number, CheckResult[]>;
  pending: { readyAt: number; lines: Line[]; traceFor?: string; checks?: boolean }[];
  acts: Record<number, ActResponse>;
  firedRules: string[];
  fallbackCursor: Record<string, number>;
  replyCount: number;
  reportId?: string;
  startedAt: string;
  attemptNumber: number;
  setAside?: boolean;
  itemPatch?: Record<string, Record<string, unknown>>;
}

export interface ReplyRule {
  id: string;
  to: string | "*";
  match: RegExp;
  reply: string;
  quick?: string[];
  /** engine signal name logged to the trace when this rule fires */
  signal?: string;
  once?: boolean;
  /** extra lines from other people after this reply */
  then?: Line[];
}

export interface BeatDef {
  title: string;
  objective: string;
  hint?: string;
  enter: Line[];
  canAdvance: (m: MockMission) => boolean;
}

export interface AnchorTest {
  text: string;
  source: "code" | "judge";
  test: (m: MockMission, vars: Record<string, string>) => { met: boolean; seq?: number; quote?: string; note?: string };
}

export interface SkillPack {
  def: Omit<SkillDef, "anchors">;
  anchors: AnchorTest[];
  missedFact?: string;
  badge: { title: string; description: string };
}

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  estMinutes: number;
  company: string;
  startLabel: { day: string; minutes: number };
  people: Person[];
  items: WorkItem[];
  artifacts: Omit<ArtifactSpec, "submitted">[];
  beats: BeatDef[];
  replies: ReplyRule[];
  fallback: Record<string, string[]>;
  /** rejected proposals shown in the trace to prove the engine validates model output */
  rejections: { personId: string; summary: string; reason: string }[];
  checks?: (m: MockMission, vars: Record<string, string>) => CheckResult[];
  onSubmit?: (artifactId: string, content: string, m: MockMission, vars: Record<string, string>) => { lines: Line[]; trace: { summary: string; verdict: "accepted" | "rejected"; reason?: string }[] };
  skillIds: string[];
}

export interface DrillDef {
  id: string;
  skillId: string;
  title: string;
  why: string;
  estMinutes: number;
  mission: MissionDef;
}

export interface RolePack {
  summary: RoleSummary;
  description: string;
  whatYouWillPractise: string[];
  safetyNote?: string;
  cast: PersonPreview[];
  skills: SkillPack[];
  ramp: Omit<RampMilestone, "state">[];
  mission: MissionDef;
  extraMissions?: MissionSummary[];
  drills: DrillDef[];
  variants: { seed: string; label: string; vars: Record<string, string> }[];
  consequence?: { title: string; detail: string; when: (m: MockMission) => boolean };
  headline: (strong: string[], gaps: string[]) => string;
}

/* helpers used by packs */
export const learnerMsgs = (m: MockMission, to?: string) =>
  m.events.filter((e) => e.from === "you" && e.kind === "message" && (!to || e.to === to));

export function findLearner(m: MockMission, re: RegExp, to?: string) {
  const e = learnerMsgs(m, to).find((x) => re.test(x.body));
  if (!e) return { met: false };
  const match = e.body.match(re);
  return { met: true, seq: e.seq, quote: quoteAround(e.body, match?.index ?? 0) };
}

export function quoteAround(body: string, idx: number) {
  const start = Math.max(0, body.lastIndexOf(" ", Math.max(0, idx - 30)) + 1);
  const slice = body.slice(start, start + 110);
  const cut = slice.length < body.length - start ? slice.slice(0, slice.lastIndexOf(" ")) || slice : slice;
  return cut.trim();
}

export function artifactHas(m: MockMission, artifactId: string, re: RegExp) {
  const c = m.submitted[artifactId];
  if (!c) return { met: false };
  const match = c.match(re);
  return { met: !!match, seq: m.submittedSeq[artifactId], quote: quoteAround(c, match?.index ?? 0) };
}

export function artifactLacks(m: MockMission, artifactId: string, re: RegExp) {
  const c = m.submitted[artifactId];
  if (!c) return { met: false };
  const met = !re.test(c);
  return { met, seq: m.submittedSeq[artifactId], quote: quoteAround(c, 0) };
}

export const opened = (m: MockMission, itemId: string) => m.opened.includes(itemId);

export function hue(h: number): string {
  return `hsl(${h} 55% 42%)`;
}
