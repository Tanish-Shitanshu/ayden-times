import { randomBytes, randomUUID } from "node:crypto";
import type {
  ActRequest,
  ActResponse,
  ArtifactSpec,
  CheckResult,
  CreateMissionRequest,
  ErrorCode,
  MissionEvent,
  MissionState,
  Person,
  StateDelta,
  TraceEntry,
  WorkItem,
} from "@ayden/contract";
import { agentRephrase, agentReply } from "../agents/persona.js";
import type { LlmClient } from "../agents/llm.js";
import type { Runner } from "../agents/sandbox.js";
import { weave } from "../agents/weaver.js";
import { config } from "../config.js";
import type { Store } from "../infra/store.js";
import { findDrill, findMission, getRole } from "../roles/index.js";
import { clockLabel } from "../roles/helpers.js";
import { fill } from "./text.js";
import type { Cond, EngineCtx, MissionBuild, MissionDef, PersonDef, RolePack, ScriptedEvent, Session, UserRec, Vars } from "./types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface Deps {
  store: Store;
  llm: LlmClient;
  runner: Runner;
}

const nowIso = () => new Date().toISOString();
const MAX_ATTEMPTS = 2;

/* ───────────── conditions ───────────── */

export function evalCond(c: Cond, s: Session): boolean {
  switch (c.t) {
    case "always":
      return true;
    case "artifact":
      return !!s.artifacts[c.id];
    case "messaged": {
      const n = c.n ?? 1;
      const src = c.scope === "beat" ? s.beatMsgTo : s.msgTo;
      return c.to ? (src[c.to] ?? 0) >= n : Object.values(src).reduce((a, b) => a + b, 0) >= n;
    }
    case "opened":
      return s.openedAt[c.item] !== undefined;
    case "saved":
      return c.item ? s.saved.includes(c.item) : s.saved.length > 0;
    case "checks":
      return s.checksRuns > 0;
    case "flag":
      return !!s.flags[c.key];
    case "any":
      return c.of.some((x) => evalCond(x, s));
    case "all":
      return c.of.every((x) => evalCond(x, s));
  }
}

/* ───────────── builds ───────────── */

export function buildFor(session: Session): { role: RolePack; def: MissionDef; build: MissionBuild } {
  const role = getRole(session.roleId);
  const def = role && findMission(role, session.defId);
  if (!role || !def) throw new ApiError(404, "not_found", "Mission definition not found");
  const drill = session.drillId ? findDrill(role, session.drillId) : undefined;
  return { role, def, build: def.build({ variantIndex: session.variantIndex, vars: session.vars, drill }) };
}

const stamp = (s: Session) => s.seq + (s.tickSub = s.tickSub + 1) / 10000;

function itemsOf(session: Session, build: MissionBuild): WorkItem[] {
  return build.items.map((it) => {
    const o = session.itemOverrides[it.id];
    if (o) return o;
    if (it.type === "file" && session.files[it.id] !== undefined) return { ...it, content: session.files[it.id]! };
    return it;
  });
}

function artifactSpecs(session: Session, build: MissionBuild): ArtifactSpec[] {
  return build.artifacts.map((a) => ({ ...a, submitted: !!session.artifacts[a.id] }));
}

function ctxOf(session: Session, events: MissionEvent[]): EngineCtx {
  return {
    session,
    vars: session.vars,
    events,
    files: session.files,
    artifacts: Object.fromEntries(Object.entries(session.artifacts).map(([k, v]) => [k, v.content])),
    lastChecks: session.lastChecks,
  };
}

export function deltaOf(session: Session, build: MissionBuild): StateDelta {
  const last = build.beats.length - 1;
  const b = build.beats[Math.min(session.beat, last)]!;
  const satisfied = evalCond(b.advanceWhen, session);
  return {
    beat: { index: session.beat, total: build.beats.length, title: `Beat ${session.beat + 1} of ${build.beats.length} · ${b.title}`, objective: b.objective, ...(session.kind === "drill" && b.hint ? { hint: b.hint } : {}) },
    clock: { minute: session.simMinute, label: clockLabel(build.clockStart.day, build.clockStart.minute, session.simMinute), minutesTotal: build.clockTotal },
    status: session.status,
    lastSeq: session.seq,
    canAdvance: session.status === "active" && session.beat < last && satisfied,
    canFinish: session.status === "active" && session.beat === last && satisfied,
    attempt: session.attempt,
    artifacts: artifactSpecs(session, build),
  };
}

export function toState(session: Session, build: MissionBuild): MissionState {
  const d = deltaOf(session, build);
  const people: Person[] = build.people.map((p) => ({ id: p.id, name: p.name, title: p.title, kind: p.kind, avatarHue: p.hue, presence: "online", modelLabel: p.modelLabel }));
  return {
    id: session.id,
    roleId: session.roleId,
    missionId: session.defId,
    kind: session.kind,
    title: build.title,
    company: build.company,
    status: session.status,
    beat: d.beat,
    clock: d.clock,
    people,
    items: itemsOf(session, build),
    artifacts: d.artifacts,
    attempt: session.attempt,
    runtime: {
      mode: session.runtimeMode,
      agentModels: [
        ...build.people.map((p) => ({ personId: p.id, model: config.models.agent })),
        { personId: "judge" as const, model: config.models.reason },
        { personId: "tester" as const, model: config.models.tester },
      ],
      ...(session.fallbackReason ? { fallbackReason: session.fallbackReason } : {}),
    },
    seed: session.seed,
    variantLabel: `Variant ${session.seed} · ${session.vars.topic ?? build.title}`,
    startedAt: session.startedAt,
    lastSeq: session.seq,
    canAdvance: d.canAdvance,
    canFinish: d.canFinish,
  };
}

/* ───────────── event writing ───────────── */

const trace = (t: Partial<TraceEntry> & Pick<TraceEntry, "actor" | "type" | "summary">): TraceEntry => ({ id: randomUUID().slice(0, 8), seq: null, at: nowIso(), ...t });

function refreshMode(session: Session, llm: LlmClient) {
  session.runtimeMode = llm.live() ? "live" : "scripted";
  session.fallbackReason = llm.live() ? undefined : llm.fallbackReason();
}

/** Turn scripted events into stored events. Live mode may restate review lines in each person's voice (engine checks they keep every fact). */
async function writeScripted(
  deps: Deps,
  session: Session,
  build: MissionBuild,
  list: ScriptedEvent[],
  tr: TraceEntry[],
  extra: { replyTo?: number } = {},
): Promise<MissionEvent[]> {
  const people = new Map(build.people.map((p) => [p.id, p]));
  const bodies = await Promise.all(
    list.map(async (se) => {
      const filled = fill(se.body, session.vars);
      if (!se.rephrase) return { text: filled, rephrased: false };
      const p = people.get(se.rephrase.personId);
      if (!p || !deps.llm.live()) return { text: filled, rephrased: false };
      const r = await agentRephrase({ llm: deps.llm, build, person: p, original: filled, mustContain: se.rephrase.mustContain });
      tr.push(...r.trace);
      return { text: r.text, rephrased: r.changed };
    }),
  );
  const out: MissionEvent[] = [];
  list.forEach((se, i) => {
    session.seq += 1;
    session.tickSub = 0;
    if (se.clockJump) session.simMinute += se.clockJump;
    if (se.itemUpdate) session.itemOverrides[se.itemUpdate.id] = se.itemUpdate;
    for (const [k, v] of Object.entries(se.setFlags ?? {})) session.flags[k] = v === -1 && /Seq$/.test(k) ? session.seq : v === -1 && /Min$/.test(k) ? session.simMinute : v;
    const kind = se.kind ?? (se.severity ? "review_comment" : "message");
    const ev: MissionEvent = {
      seq: session.seq,
      at: nowIso(),
      simMinute: session.simMinute,
      kind,
      channel: se.channel,
      from: se.from as MissionEvent["from"],
      ...(se.to ? { to: se.to as MissionEvent["to"] } : {}),
      body: bodies[i]!.text,
      ...(extra.replyTo ? { replyTo: extra.replyTo } : {}),
      source: se.from === "system" ? "engine" : bodies[i]!.rephrased ? "agent" : "script",
      meta: {
        ...(se.quickReplies ? { quickReplies: se.quickReplies } : {}),
        ...(se.severity ? { severity: se.severity } : {}),
        ...(se.commentFile ? { commentFile: se.commentFile } : {}),
        ...(se.commentLine ? { commentLine: se.commentLine } : {}),
        ...(se.itemUpdate ? { itemId: se.itemUpdate.id } : {}),
      },
    };
    out.push(ev);
  });
  return out;
}

function learnerEvent(session: Session, e: Pick<MissionEvent, "kind" | "channel" | "body"> & Partial<MissionEvent>): MissionEvent {
  session.seq += 1;
  session.tickSub = 0;
  return { seq: session.seq, at: nowIso(), simMinute: session.simMinute, from: "you", source: "learner", ...e } as MissionEvent;
}

function beatEnterEvents(session: Session, build: MissionBuild, events: MissionEvent[]): ScriptedEvent[] {
  const b = build.beats[session.beat];
  if (!b?.onEnter) return [];
  return typeof b.onEnter === "function" ? b.onEnter(ctxOf(session, events)) : b.onEnter;
}

/* ───────────── create ───────────── */

const rid = (n = 6) => randomBytes(n).toString("base64url").replace(/[-_]/g, "x").slice(0, n);

export async function createMission(deps: Deps, user: UserRec, req: CreateMissionRequest): Promise<MissionState> {
  const { store, llm } = deps;
  const role = getRole(req.roleId);
  if (!role || role.status !== "ready") throw new ApiError(404, "not_found", "That role is not available yet.");
  if (!user.consent?.age18 || !user.consent.storeWork) throw new ApiError(400, "consent_required", "We need your consent first.");
  const onboarding = user.onboardings.find((o) => o.roleId === role.id);
  if (!onboarding) throw new ApiError(400, "validation", "Complete onboarding for this role first.");

  const sessions = await store.listSessionsByUser(user.id);
  const hourAgo = Date.now() - 3600_000;
  if (sessions.filter((s) => new Date(s.startedAt).getTime() > hourAgo).length >= 10) throw new ApiError(429, "rate_limited", "Too many missions started. Try again later.", 60_000);

  const drill = req.drillId ? findDrill(role, req.drillId) : undefined;
  if (req.drillId && !drill) throw new ApiError(404, "not_found", "Drill not found.");
  const def = drill ? role.missions.find((m) => m.id === drill.missionId) : findMission(role, req.missionId);
  if (!def) throw new ApiError(404, "not_found", "Mission not found.");

  const priorMissions = sessions.filter((s) => s.roleId === role.id && s.kind === "mission").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const used = (i: number) => sessions.filter((s) => s.defId === def.id && s.variantIndex === i && s.kind === (drill ? "drill" : "mission")).length;
  let variantIndex: number;
  if (drill) variantIndex = ((priorMissions[0]?.variantIndex ?? 0) + 1) % def.variants;
  else if (req.reseed && priorMissions[0]) variantIndex = (priorMissions[0].variantIndex + 1) % def.variants;
  else variantIndex = [...Array(def.variants).keys()].sort((a, b) => used(a) - used(b) || a - b)[0]!;
  const attemptNo = used(variantIndex) + 1;
  if (!req.reseed && attemptNo > MAX_ATTEMPTS) throw new ApiError(409, "attempt_cap", "You have used both attempts on this variant. Try a drill or a new variant.");

  const seed = rid(4).toUpperCase();
  let vars: Vars = { ...def.varsFor(seed, variantIndex) };
  const reports = await store.listReportsByUser(user.id);
  const weak = reports.filter((r) => r.roleId === role.id).flatMap((r) => r.skills.filter((s) => s.state === "gap").map((s) => s.label));
  const woven = await weave(llm, def, vars, { experience: onboarding.experience, weakSkills: [...new Set(weak)].slice(0, 3), reseed: !!req.reseed });
  if (woven) vars = { ...vars, ...woven };

  const session: Session = {
    id: "m_" + rid(8),
    uid: user.id,
    roleId: role.id,
    defId: def.id,
    kind: drill ? "drill" : "mission",
    drillId: drill?.id,
    seed,
    variantIndex,
    vars,
    status: "active",
    beat: 0,
    simMinute: 0,
    seq: 0,
    attempt: { number: Math.min(attemptNo, MAX_ATTEMPTS), max: MAX_ATTEMPTS },
    runtimeMode: "scripted",
    flags: {},
    fired: [],
    files: {},
    originalFiles: {},
    itemOverrides: {},
    openedAt: {},
    tickSub: 0,
    firstSaveSeq: null,
    lastSaveSeq: null,
    lastCheckSeq: null,
    saved: [],
    msgTo: {},
    beatMsgTo: {},
    checksRuns: 0,
    checksBeforeFirstSubmit: 0,
    submittedCount: 0,
    artifacts: {},
    lastChecks: null,
    commitments: [],
    startedAt: nowIso(),
    actCache: {},
  };
  refreshMode(session, llm);
  const build = def.build({ variantIndex, vars, drill });
  for (const it of build.items) if (it.type === "file") {
    session.files[it.id] = it.content;
    session.originalFiles[it.path] = it.content;
  }
  // checks and anchors look files up by path as well as by item id
  for (const it of build.items) if (it.type === "file") session.files[it.path] = it.content;

  const tr: TraceEntry[] = [];
  if (woven) tr.push(trace({ actor: `Scenario Weaver (${config.models.reason})`, model: config.models.reason, type: "proposal", summary: "Personalised the opening message and a scene detail for this learner", verdict: "accepted" }));
  const events = await writeScripted(deps, session, build, beatEnterEvents(session, build, []), tr);
  await store.putSession(session);
  await store.appendEvents(session.id, events);
  await store.appendTrace(session.id, tr);
  await store.incr("missionsStarted");
  return toState(session, build);
}

/* ───────────── act ───────────── */

const COMMIT_RE = /\b(i('| wi)ll|i can|let me)\b[^.?!]{0,60}\b(by|before|today|eod|tonight|tomorrow|in \d+ ?(min|minutes|hours?))\b/i;

function scriptedReply(build: MissionBuild, person: PersonDef, text: string, session: Session) {
  const rule = (build.replies[person.id] ?? []).find((r) => r.match.test(text));
  if (rule) return { text: fill(rule.text, session.vars), quick: rule.quickReplies, flags: rule.setFlags };
  const n = session.msgTo[person.id] ?? 1;
  return { text: person.defaultLines[(n - 1) % person.defaultLines.length]!, quick: undefined, flags: undefined };
}

export async function act(deps: Deps, uid: string, sessionId: string, req: ActRequest): Promise<ActResponse> {
  const { store, llm } = deps;
  const session = await store.getSession(sessionId);
  if (!session || session.uid !== uid) throw new ApiError(404, "not_found", "Mission not found.");
  const cached = session.actCache[req.clientSeq];
  if (cached) return cached as ActResponse;
  if (session.status !== "active") throw new ApiError(409, "conflict", "This mission is finished.");

  const { build } = buildFor(session);
  const prior = await store.listEvents(session.id, 0);
  const events: MissionEvent[] = [];
  const tr: TraceEntry[] = [];
  const all = () => [...prior, ...events];
  let rejectedReason: string | undefined;
  refreshMode(session, llm);

  const item = (id: string) => build.items.find((i) => i.id === id);

  switch (req.kind) {
    case "message": {
      const person = build.people.find((p) => p.id === req.to);
      const text = req.text?.trim() ?? "";
      if (!person) throw new ApiError(400, "validation", "Unknown person.");
      if (!text || text.length > 4000) throw new ApiError(400, "validation", "Write a message of up to 4000 characters.");
      const le = learnerEvent(session, { kind: "message", channel: req.channel === "system" ? "chat" : req.channel, body: text, to: person.id as never });
      events.push(le);
      session.msgTo[person.id] = (session.msgTo[person.id] ?? 0) + 1;
      session.beatMsgTo[person.id] = (session.beatMsgTo[person.id] ?? 0) + 1;
      session.simMinute += build.cost.message;
      const flags = build.onLearnerMessage?.({ text, to: person.id, session, events: all() });
      if (flags) Object.assign(session.flags, flags);
      if (build.detectCommitments && COMMIT_RE.test(text)) {
        session.commitments.push({ text: text.slice(0, 160), personId: person.id, atMinute: session.simMinute, seq: le.seq });
        tr.push(trace({ seq: le.seq, actor: "Engine", type: "signal", summary: "Commitment detected in your message and recorded in the ledger", verdict: "accepted" }));
      }
      // scripted triggers on first message to a person
      let replaced = false;
      for (const t of build.triggers) {
        if (session.fired.includes(t.id) || !t.messagedFirst || t.messagedFirst !== person.id) continue;
        if (t.beat !== undefined && t.beat !== session.beat) continue;
        if ((session.msgTo[person.id] ?? 0) !== 1) continue;
        session.fired.push(t.id);
        events.push(...(await writeScripted(deps, session, build, t.events, tr)));
        replaced = replaced || !!t.replacesReply;
      }
      if (!replaced) {
        const out = await agentReply({ llm, build, person, session, events: all(), learnerText: text });
        tr.push(...out.trace);
        let replyText = out.text;
        let quick = out.quickReplies;
        let fallback = false;
        if (replyText === null) {
          const s = scriptedReply(build, person, text, session);
          replyText = s.text;
          quick = s.quick;
          if (s.flags) Object.assign(session.flags, s.flags);
          fallback = true;
          await store.incr("fallbacks");
        } else {
          const rule = (build.replies[person.id] ?? []).find((r) => r.match.test(text));
          if (rule?.setFlags) Object.assign(session.flags, rule.setFlags);
        }
        session.seq += 1;
        session.tickSub = 0;
        events.push({
          seq: session.seq,
          at: nowIso(),
          simMinute: session.simMinute,
          kind: "message",
          channel: le.channel,
          from: person.id as never,
          to: "you",
          body: replyText,
          replyTo: le.seq,
          source: fallback ? "script" : "agent",
          ...(fallback ? { fallback: true } : {}),
          ...(quick?.length ? { meta: { quickReplies: quick } } : {}),
        });
      }
      break;
    }
    case "open_item": {
      if (!item(req.itemId)) throw new ApiError(400, "validation", "Unknown item.");
      if (session.openedAt[req.itemId] === undefined) session.openedAt[req.itemId] = stamp(session);
      session.simMinute += build.cost.open;
      break;
    }
    case "save_file": {
      const it = item(req.itemId);
      if (!it || it.type !== "file" || !it.editable) throw new ApiError(400, "validation", "That file cannot be edited.");
      if (typeof req.content !== "string" || req.content.length > 30_000) throw new ApiError(400, "validation", "File is too large.");
      session.files[it.id] = req.content;
      session.files[it.path] = req.content;
      if (!session.saved.includes(it.id)) session.saved.push(it.id);
      const st = stamp(session);
      session.firstSaveSeq ??= st;
      session.lastSaveSeq = st;
      break;
    }
    case "run_checks": {
      if (!build.runChecks) {
        rejectedReason = "This mission has no code checks.";
        break;
      }
      const res = await build.runChecks({ ...ctxOf(session, all()), runner: deps.runner });
      session.lastChecks = res.results;
      session.checksRuns += 1;
      session.lastCheckSeq = stamp(session);
      if (session.submittedCount === 0) session.checksBeforeFirstSubmit += 1;
      session.simMinute += build.cost.checks;
      const failed = res.results.filter((r) => !r.passed).length;
      const label = res.mode === "static" ? "Static checks (the sandbox was unavailable)" : res.mode === "local" ? "Ran checks locally (development)" : "Ran checks in a Google-hosted sandbox";
      const ev = learnerEvent(session, { kind: "check_result", channel: "checks", body: `${label}: ${res.results.length - failed} of ${res.results.length} passed.`, from: "system" as never, source: "engine", meta: { checks: res.results } });
      events.push(ev);
      tr.push(trace({ seq: ev.seq, actor: res.mode === "sandbox" ? `Sandbox (${config.models.tester} + code execution)` : "Engine", type: "check", summary: `${label}: ${failed} failing`, verdict: "accepted" }));
      if (res.mode === "static") await store.incr("fallbacks");
      break;
    }
    case "submit_artifact": {
      const spec = build.artifacts.find((a) => a.id === req.artifactId);
      const content = req.content?.trim() ?? "";
      if (!spec) throw new ApiError(400, "validation", "Unknown artifact.");
      if (!content) throw new ApiError(400, "validation", "Write something before you submit.");
      if (content.length > spec.maxChars) throw new ApiError(400, "validation", `Keep it under ${spec.maxChars} characters.`);
      const le = learnerEvent(session, { kind: "artifact", channel: "chat", body: `**${spec.title}**\n\n${content}`, meta: { artifactId: spec.id } });
      events.push(le);
      const first = !session.artifacts[spec.id];
      session.artifacts[spec.id] = { content, at: nowIso(), seq: le.seq };
      session.simMinute += build.cost.submit;
      if (first) session.submittedCount += 1;
      if (build.onSubmit) {
        const ctx = { ...ctxOf(session, all()), artifactId: spec.id, content, runChecks: () => build.runChecks!({ ...ctxOf(session, all()), runner: deps.runner }) };
        const reaction = await build.onSubmit(ctx);
        if (reaction.checks) {
          session.lastChecks = reaction.checks;
          session.checksRuns += 1;
          session.lastCheckSeq = stamp(session);
        }
        for (const [k, v] of Object.entries(reaction.setFlags ?? {})) session.flags[k] = v;
        events.push(...(await writeScripted(deps, session, build, reaction.events, tr)));
        tr.push(trace({ seq: le.seq, actor: "Engine", type: "validation", summary: `Reviewed ${spec.title}: ${reaction.events.length} reactions accepted`, verdict: "accepted" }));
      }
      break;
    }
    case "advance": {
      const d = deltaOf(session, build);
      if (!d.canAdvance) {
        rejectedReason = "Finish the objective to continue.";
        break;
      }
      session.beat += 1;
      session.beatMsgTo = {};
      session.simMinute += build.cost.advance;
      events.push(...(await writeScripted(deps, session, build, beatEnterEvents(session, build, all()), tr)));
      tr.push(trace({ actor: "Engine", type: "validation", summary: `Moved to ${build.beats[session.beat]!.title}`, verdict: "accepted" }));
      break;
    }
    case "finish":
      throw new ApiError(400, "validation", "Use POST /missions/:id/finish.");
  }

  // condition-triggered scripted events
  for (const t of build.triggers) {
    if (!t.cond || session.fired.includes(t.id)) continue;
    if (t.beat !== undefined && t.beat !== session.beat) continue;
    if (evalCond(t.cond, session)) {
      session.fired.push(t.id);
      events.push(...(await writeScripted(deps, session, build, t.events, tr)));
    }
  }

  const seqTrace = tr.map((x, i) => ({ ...x, seq: x.seq ?? events[Math.min(i, events.length - 1)]?.seq ?? null }));
  const res: ActResponse = {
    accepted: !rejectedReason,
    ...(rejectedReason ? { rejectedReason } : {}),
    events,
    delta: { ...deltaOf(session, build), changedItems: itemsOf(session, build).filter((i) => i.type === "file" && session.saved.includes(i.id) || session.itemOverrides[i.id]) },
    pending: false,
    trace: seqTrace,
  };
  session.actCache[req.clientSeq] = res;
  const keys = Object.keys(session.actCache).map(Number).sort((a, b) => a - b);
  for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete session.actCache[k];
  await store.putSession(session);
  await store.appendEvents(session.id, events);
  await store.appendTrace(session.id, seqTrace);
  return res;
}

export async function loadOwned(store: Store, uid: string, id: string): Promise<Session> {
  const s = await store.getSession(id);
  if (!s || s.uid !== uid) throw new ApiError(404, "not_found", "Mission not found.");
  return s;
}
