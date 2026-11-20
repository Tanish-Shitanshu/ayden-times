/**
 * In-browser mock backend. Implements every endpoint of contract v1.0 on top of localStorage,
 * so the UI behaves exactly as it will against the real API. Only loaded when VITE_API_MODE=mock.
 */
import type {
  ActRequest, ActResponse, Cohort, CohortInsights, CreateMissionRequest, ErrorCode, EventsResponse, Me,
  MissionEvent, MissionState, Onboarding, Progress, RampMilestone, Report, RoleDetail, RoleId, RoleSummary,
  SkillResult, StateDelta, SystemStatus, TraceEntry, UpdateConsentRequest, UpdateMeRequest, WorkItem, NextStep, Badge,
} from "../../contract";
import type { Line, MissionDef, MockMission, RolePack } from "./types";
import { getSettings, setSettings } from "./settings";
import { swe } from "./packs/swe";
import { banking } from "./packs/banking";
import { nurse } from "./packs/nurse";
import { consulting } from "./packs/consulting";
import { data } from "./packs/data";

const PACKS: RolePack[] = [swe, banking, nurse, consulting, data];
const DB_KEY = "ayden_mock_db_v1";
const SID_KEY = "ayden_mock_sid";

interface StoredReport { report: Report; pollsLeft: number; userId: string; fail: boolean }
interface StoredCohort { cohort: Omit<Cohort, "role" | "memberCount">; members: string[]; seeded: boolean }
interface DB {
  users: Record<string, Omit<Me, "cohorts">>;
  missions: Record<string, MockMission>;
  reports: Record<string, StoredReport>;
  cohorts: Record<string, StoredCohort>;
  counters: { modelCalls: number; fallbacks: number; quotesRejected: number };
  creations: Record<string, number[]>;
}

class HttpError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public retryAfterMs?: number) { super(message); }
}

/* ───────── storage ───────── */

let db: DB = load();
function load(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch { /* corrupted: start fresh */ }
  return {
    users: {}, missions: {}, reports: {}, counters: { modelCalls: 0, fallbacks: 0, quotesRejected: 0 }, creations: {},
    cohorts: {
      c_seed: { cohort: { id: "c_seed", name: "SNU CSE · Class of 2027", code: "SNU-7K2", ownerId: "u_seed_owner", createdAt: "2026-11-02T09:00:00Z" }, members: Array.from({ length: 23 }, (_, i) => `u_seed_${i}`), seeded: true },
    },
  };
}
function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* quota: keep in memory */ }
}

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const rand = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
function fillDeep<T>(v: T, vars: Record<string, string>): T {
  if (typeof v === "string") return fill(v, vars) as T;
  if (Array.isArray(v)) return v.map((x) => fillDeep(x, vars)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, vars)])) as T;
  return v;
}

/* ───────── helpers ───────── */

function pack(roleId: string) {
  const p = PACKS.find((x) => x.summary.id === roleId);
  if (!p) throw new HttpError(404, "not_found", "That role does not exist.");
  return p;
}
function summaryOf(p: RolePack): RoleSummary {
  const s = { ...p.summary };
  if (s.id === "data-analyst" && getSettings().dataPlanned) s.status = "planned";
  return s;
}
function defOf(m: MockMission): MissionDef {
  const p = pack(m.roleId);
  if (m.drillId) {
    const d = p.drills.find((x) => x.id === m.drillId);
    if (!d) throw new HttpError(404, "not_found", "That drill does not exist.");
    return d.mission;
  }
  return p.mission;
}
const varsOf = (m: MockMission) => pack(m.roleId).variants[m.variantIndex]?.vars ?? {};

function currentUser(required = true) {
  const sid = localStorage.getItem(SID_KEY);
  const u = sid ? db.users[sid] : undefined;
  if (!u && required) throw new HttpError(401, "unauthenticated", "Your session ended.");
  return u;
}
function meOf(u: Omit<Me, "cohorts">): Me {
  const cohorts = Object.values(db.cohorts).filter((c) => c.cohort.ownerId === u.userId || c.members.includes(u.userId)).map((c) => cohortView(c, u.userId));
  const mine = Object.values(db.missions).filter((m) => m.userId === u.userId);
  return {
    ...u, cohorts,
    counts: { missionsStarted: mine.length, missionsCompleted: mine.filter((m) => m.status === "done" && m.kind === "mission").length, drillsCompleted: mine.filter((m) => m.status === "done" && m.kind === "drill").length },
  };
}
function cohortView(c: StoredCohort, userId: string): Cohort {
  return { ...c.cohort, memberCount: c.members.length, role: c.cohort.ownerId === userId ? "owner" : "member" };
}
function ownMission(id: string) {
  const u = currentUser()!;
  const m = db.missions[id];
  if (!m || m.userId !== u.userId) throw new HttpError(404, "not_found", "We could not find that mission.");
  return m;
}
function clockLabel(def: MissionDef, minute: number) {
  const t = def.startLabel.minutes + minute;
  const h = Math.floor(t / 60) % 24;
  const mm = t % 60;
  return `${def.startLabel.day} ${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* ───────── mission state ───────── */

function beatInfo(m: MockMission) {
  const def = defOf(m);
  const b = def.beats[m.beatIndex];
  const vars = varsOf(m);
  return { index: m.beatIndex, total: def.beats.length, title: `Beat ${m.beatIndex + 1} of ${def.beats.length} · ${fill(b.title, vars)}`, objective: fill(b.objective, vars), ...(m.kind === "drill" && b.hint ? { hint: fill(b.hint, vars) } : {}) };
}
function artifactsOf(m: MockMission) {
  return fillDeep(defOf(m).artifacts, varsOf(m)).map((a) => ({ ...a, submitted: !!m.submitted[a.id] }));
}
let changedThisRequest = new Set<string>();
function itemsOf(m: MockMission): WorkItem[] {
  return fillDeep(defOf(m).items, varsOf(m)).map((it) => {
    const patched = m.itemPatch?.[it.id] ? ({ ...it, ...fillDeep(m.itemPatch[it.id], varsOf(m)) } as WorkItem) : it;
    return patched.type === "file" && m.files[patched.id] !== undefined ? { ...patched, content: m.files[patched.id] } : patched;
  });
}
const changedItems = (m: MockMission) => (changedThisRequest.size ? itemsOf(m).filter((i) => changedThisRequest.has(i.id)) : undefined);
function canFinish(m: MockMission) {
  const def = defOf(m);
  return m.status === "active" && m.beatIndex === def.beats.length - 1 && def.artifacts.filter((a) => a.required).every((a) => !!m.submitted[a.id]);
}
function canAdvance(m: MockMission) {
  const def = defOf(m);
  return m.status === "active" && m.beatIndex < def.beats.length - 1 && def.beats[m.beatIndex].canAdvance(m);
}
function delta(m: MockMission, changedItems?: WorkItem[]): StateDelta {
  const def = defOf(m);
  return { beat: beatInfo(m), clock: { minute: m.minute, label: clockLabel(def, m.minute), minutesTotal: 480 }, status: m.status, lastSeq: m.events.at(-1)?.seq ?? 0, canAdvance: canAdvance(m), canFinish: canFinish(m), attempt: { number: m.attemptNumber, max: 2 }, artifacts: artifactsOf(m), ...(changedItems ? { changedItems } : {}) };
}
function stateOf(m: MockMission): MissionState {
  const def = defOf(m);
  const p = pack(m.roleId);
  const s = getSettings();
  const vars = varsOf(m);
  const people = fillDeep(def.people, vars);
  const variant = p.variants[m.variantIndex];
  return {
    id: m.id, roleId: m.roleId, missionId: def.id, kind: m.kind, title: fill(def.title, vars), company: def.company, status: m.status,
    beat: beatInfo(m), clock: { minute: m.minute, label: clockLabel(def, m.minute), minutesTotal: 480 },
    people, items: itemsOf(m), artifacts: artifactsOf(m), attempt: { number: m.attemptNumber, max: 2 },
    runtime: { mode: s.runtime, agentModels: [...people.map((x) => ({ personId: x.id, model: "gemini-4-hydrogen" })), { personId: "judge" as const, model: "gemini-4-argon" }, { personId: "director" as const, model: "gemini-4-argon" }], ...(s.runtime !== "live" ? { fallbackReason: s.runtime === "scripted" ? "Model quota reached; colleagues are replying from the scenario script." : "Replies are served from cache after repeated model timeouts." } : {}) },
    seed: m.seed, variantLabel: `Variant ${m.seed} · ${variant?.label ?? "drill"}`, startedAt: m.startedAt, lastSeq: m.events.at(-1)?.seq ?? 0,
    canAdvance: canAdvance(m), canFinish: canFinish(m),
  };
}

/* ───────── event emission ───────── */

function personOf(m: MockMission, id: string) {
  return fillDeep(defOf(m).people, varsOf(m)).find((p) => p.id === id);
}
function pushTrace(m: MockMission, t: Omit<TraceEntry, "id" | "at">) {
  const e: TraceEntry = { id: rid("t"), at: now(), ...t };
  m.trace.push(e);
  return e;
}
function emit(m: MockMission, line: Line, source: MissionEvent["source"], opts: { scripted?: boolean } = {}): MissionEvent {
  const vars = varsOf(m);
  if (line.wait) m.minute += line.wait;
  if (line.updateItem) {
    m.itemPatch = { ...(m.itemPatch ?? {}), [line.updateItem.id]: line.updateItem.patch };
    changedThisRequest.add(line.updateItem.id);
  }
  const s = getSettings();
  const person = personOf(m, line.from);
  const fallback = !!person && s.runtime !== "live";
  const ev: MissionEvent = {
    seq: (m.events.at(-1)?.seq ?? 0) + 1, at: now(), simMinute: m.minute,
    kind: line.kind ?? "message", channel: line.channel ?? (line.kind === "review_comment" ? "review" : line.kind === "check_result" ? "checks" : person || line.from === "you" ? "chat" : "system"),
    from: line.from, ...(person ? { to: "you" as const } : {}),
    body: fill(line.body, vars), source: fallback ? "script" : source,
    ...(fallback ? { fallback: true } : {}),
    ...(line.meta ? { meta: fillDeep(line.meta, vars) } : {}),
  };
  m.events.push(ev);
  if (person) {
    const first = person.name.replace(/^Dr\. /, "").split(" ")[0];
    db.counters.modelCalls += 1;
    if (fallback) {
      db.counters.fallbacks += 1;
      pushTrace(m, { seq: ev.seq, actor: `${first} (script)`, type: "fallback", summary: `Served scripted line instead of a live reply: "${ev.body.slice(0, 48)}…"`, verdict: "accepted", reason: "Model unavailable" });
    } else {
      pushTrace(m, { seq: ev.seq, actor: `${first} (${person.modelLabel ?? "Gemini"})`, model: "gemini-4-hydrogen", type: "proposal", summary: `Proposed tool ${ev.kind === "review_comment" ? "comment_on_review" : "reply"}(${ev.channel}, "${ev.body.replace(/\*\*/g, "").slice(0, 48)}…")`, verdict: "accepted", latencyMs: opts.scripted ? undefined : rand(900, 3400) });
    }
  }
  return ev;
}

function enterBeat(m: MockMission) {
  const def = defOf(m);
  const p = pack(m.roleId);
  const b = def.beats[m.beatIndex];
  emit(m, { from: "system", kind: "beat", body: `Beat ${m.beatIndex + 1} of ${def.beats.length} · ${b.title}` }, "engine");
  b.enter.forEach((l) => emit(m, l, "script", { scripted: true }));
  if (!m.drillId && m.beatIndex === def.beats.length - 1 && p.consequence?.when(m)) {
    const c = emit(m, { from: "system", kind: "consequence", wait: 5, body: `**${p.consequence.title}.** ${p.consequence.detail}` }, "engine");
    pushTrace(m, { seq: c.seq, actor: "Engine", type: "consequence", summary: `Consequence fired: ${p.consequence.title}`, verdict: "accepted" });
  }
}

function flush(m: MockMission) {
  const t = Date.now();
  const ready = m.pending.filter((p) => p.readyAt <= t);
  if (!ready.length) return;
  m.pending = m.pending.filter((p) => p.readyAt > t);
  for (const p of ready) {
    if (p.checks) runChecksNow(m);
    p.lines.forEach((l) => emit(m, l, "agent"));
  }
}

function runChecksNow(m: MockMission) {
  const def = defOf(m);
  const results = def.checks?.(m, varsOf(m)) ?? [];
  m.checksRuns += 1;
  m.lastChecks = results;
  let h = 0;
  const masked = results.map((c) => (c.hidden ? { ...c, name: `Hidden check ${++h}` } : c));
  const passed = results.filter((c) => c.passed).length;
  const ev = emit(m, { from: "system", kind: "check_result", wait: 6, body: `Ran ${results.length} checks in a Google-hosted sandbox: ${passed} passed, ${results.length - passed} failed.`, meta: { checks: masked } }, "engine");
  m.checkReveal[ev.seq] = results;
  pushTrace(m, { seq: ev.seq, actor: "Tester (code execution)", model: "gemini-4-hydrogen", type: "check", summary: `Executed ${results.length} checks: ${passed} passed`, verdict: "accepted", latencyMs: rand(6000, 14000) });
}

function schedule(m: MockMission, lines: Line[], checks = false) {
  const s = getSettings();
  const delay = checks ? (s.slowModel ? 10000 : 2200) : s.slowModel ? 10000 : 2600;
  m.pending.push({ readyAt: Date.now() + delay, lines, checks });
}

/* ───────── act ───────── */

function act(m: MockMission, req: ActRequest): ActResponse {
  const cached = m.acts[req.clientSeq];
  if (cached) return cached;
  if (m.status !== "active") throw new HttpError(409, "conflict", "This mission is no longer active.");
  flush(m);
  const before = m.events.at(-1)?.seq ?? 0;
  const traceBefore = m.trace.length;
  const def = defOf(m);
  const vars = varsOf(m);

  switch (req.kind) {
    case "message": {
      const text = req.text.trim();
      if (!text) throw new HttpError(400, "validation", "Write a message first.");
      if (text.length > 4000) throw new HttpError(400, "validation", "Messages can be up to 4000 characters.");
      const person = personOf(m, req.to);
      if (!person) throw new HttpError(400, "validation", "That person is not in this mission.");
      m.minute += 3;
      const mine = emit(m, { from: "you", body: text, channel: req.channel }, "learner");
      mine.to = req.to;
      const rule = def.replies.find((r) => (r.to === req.to || r.to === "*") && r.match.test(text) && !(r.once && m.firedRules.includes(r.id)));
      if (rule?.signal) pushTrace(m, { seq: mine.seq, actor: "Engine", type: "signal", summary: `Signal ${rule.signal} = true`, verdict: "accepted" });
      if (rule) m.firedRules.push(rule.id);
      m.replyCount += 1;
      const rej = def.rejections.find((r) => r.personId === req.to);
      if (rej && m.replyCount % 3 === 2 && getSettings().runtime === "live") {
        pushTrace(m, { seq: mine.seq, actor: `${person.name.replace(/^Dr\. /, "").split(" ")[0]} (${person.modelLabel ?? "Gemini"})`, model: "gemini-4-hydrogen", type: "validation", summary: rej.summary, verdict: "rejected", reason: rej.reason, latencyMs: rand(800, 2200) });
      }
      let body: string;
      if (rule) body = rule.reply;
      else {
        const pool = def.fallback[req.to] ?? ["Thanks."];
        const i = m.fallbackCursor[req.to] ?? 0;
        body = pool[i % pool.length];
        m.fallbackCursor[req.to] = i + 1;
      }
      const lines: Line[] = [{ from: req.to, body, wait: 2, channel: req.channel === "email" || req.channel === "call" ? req.channel : "chat", ...(rule?.quick ? { meta: { quickReplies: rule.quick } } : {}) }, ...(rule?.then ?? [])];
      const s = getSettings();
      if (s.slowModel || Math.random() < 0.35) schedule(m, lines);
      else lines.forEach((l) => emit(m, l, "agent"));
      break;
    }
    case "open_item": {
      const it = itemsOf(m).find((x) => x.id === req.itemId);
      if (!it) throw new HttpError(400, "validation", "That item is not in this mission.");
      if (!m.opened.includes(req.itemId)) {
        m.opened.push(req.itemId);
        pushTrace(m, { seq: m.events.at(-1)?.seq ?? null, actor: "Engine", type: "signal", summary: `Signal opened_item(${it.title}) = true`, verdict: "accepted" });
      }
      break;
    }
    case "save_file": {
      const it = itemsOf(m).find((x) => x.id === req.itemId);
      if (!it || it.type !== "file" || !it.editable) throw new HttpError(400, "validation", "That file cannot be edited.");
      if (req.content.length > 50000) throw new HttpError(400, "validation", "That file is too large.");
      m.files[req.itemId] = req.content;
      changedThisRequest.add(req.itemId);
      break;
    }
    case "run_checks": {
      if (!def.checks) throw new HttpError(400, "validation", "There is nothing to run checks on in this mission.");
      m.minute += 4;
      schedule(m, [], true);
      break;
    }
    case "submit_artifact": {
      const a = def.artifacts.find((x) => x.id === req.artifactId);
      if (!a) throw new HttpError(400, "validation", "That piece of work is not part of this mission.");
      const content = req.content.trim();
      if (!content) throw new HttpError(400, "validation", "Write something before you submit.");
      if (content.length > a.maxChars) throw new HttpError(400, "validation", `Keep it under ${a.maxChars} characters.`);
      m.submitted[a.id] = content;
      m.minute += 8;
      const ev = emit(m, { from: "you", kind: "artifact", channel: "system", body: content, meta: { artifactId: a.id } }, "learner");
      m.submittedSeq[a.id] = ev.seq;
      const out = def.onSubmit?.(a.id, content, m, vars);
      out?.trace.forEach((t) => pushTrace(m, { seq: ev.seq, actor: "Engine", type: "check", summary: t.summary, verdict: t.verdict, reason: t.reason }));
      if (out?.lines.length) schedule(m, out.lines);
      break;
    }
    case "advance": {
      if (!canAdvance(m)) throw new HttpError(409, "conflict", `Finish the objective to continue: ${beatInfo(m).objective}`);
      m.beatIndex += 1;
      m.minute += 30;
      enterBeat(m);
      break;
    }
    case "finish": {
      finish(m);
      break;
    }
  }
  const res: ActResponse = { accepted: true, events: m.events.filter((e) => e.seq > before), delta: delta(m, changedItems(m)), pending: m.pending.length > 0, trace: m.trace.slice(traceBefore) };
  m.acts[req.clientSeq] = res;
  return res;
}

function finish(m: MockMission) {
  if (!canFinish(m)) throw new HttpError(409, "conflict", "Submit the required work in the last beat before finishing.");
  const s = getSettings();
  m.status = "judging";
  m.pending = [];
  const id = rid("r");
  m.reportId = id;
  db.reports[id] = { report: emptyReport(id, m), pollsLeft: s.reportPolls, userId: m.userId, fail: s.failNextReport };
  if (s.failNextReport) setSettings({ failNextReport: false });
  return { reportId: id, status: "processing" as const };
}

/* ───────── reports ───────── */

function emptyReport(id: string, m: MockMission): Report {
  return { id, missionId: m.id, roleId: m.roleId, createdAt: now(), status: "processing", headline: "", summary: "", skills: [], keyMoments: [], consequences: [], nextSteps: [], integrity: { judgeModel: "gemini-4-argon", mode: getSettings().runtime, quotesVerified: 0, quotesRejected: 0, uncertainSkills: [], notes: [] }, privacyNote: "Only you can see this report.", shareSummary: "" };
}

function buildReport(id: string, m: MockMission): Report {
  const p = pack(m.roleId);
  const def = defOf(m);
  const vars = varsOf(m);
  const u = db.users[m.userId];
  const onb = u?.onboardings.find((o) => o.roleId === m.roleId);
  const learnerCount = m.events.filter((e) => e.from === "you").length;
  const bodyAt = (seq?: number) => m.events.find((e) => e.seq === seq)?.body ?? "";
  let verified = 0;
  const skills: SkillResult[] = p.skills.map((sk) => {
    const inScope = def.skillIds.includes(sk.def.id);
    const results = inScope ? sk.anchors.map((a) => ({ a, r: a.test(m, vars) })) : [];
    const met = results.filter((x) => x.r.met).length;
    const total = sk.anchors.length;
    const self = (onb?.selfRatings[sk.def.id] as number | undefined) ?? null;
    let state: SkillResult["state"];
    if (!inScope || (met === 0 && learnerCount < 2)) state = "uncertain";
    else if (met >= sk.def.targetLevel) state = "strong";
    else if (met >= Math.max(1, sk.def.targetLevel - 1)) state = "developing";
    else state = "gap";
    const evidence = results.filter((x) => x.r.seq && x.r.quote && bodyAt(x.r.seq).includes(x.r.quote)).slice(0, 2).map((x) => {
      verified += 1;
      return { eventSeq: x.r.seq!, quote: x.r.quote!, note: x.r.note ?? (x.r.met ? `This shows: ${x.a.text.toLowerCase()}.` : `Missing here: ${x.a.text.toLowerCase()}.`), tone: x.r.met ? ("good" as const) : ("miss" as const), verifiedBySystem: true };
    });
    let gap: SkillResult["confidenceGap"] = null;
    if (self !== null && state !== "uncertain") {
      const d = (self - 1) / 4 - met / total;
      gap = d > 0.3 ? "overestimated" : d < -0.3 ? "underestimated" : "aligned";
    }
    return {
      skillId: sk.def.id, label: sk.def.label, selfRating: self, anchorsMet: met, anchorsTotal: total, target: sk.def.targetLevel, state, confidenceGap: gap,
      signals: results.map((x, i) => ({ id: `${sk.def.id}_${i}`, anchor: x.a.text, met: x.r.met, source: x.a.source, ...(x.r.seq ? { eventSeq: x.r.seq } : {}) })),
      evidence, ...(state !== "strong" && inScope && sk.missedFact ? { missedFact: fill(sk.missedFact, vars) } : {}),
    };
  });
  const strong = skills.filter((s) => s.state === "strong").map((s) => s.label);
  const gaps = skills.filter((s) => s.state === "gap" || s.state === "developing").sort((a, b) => (a.state === "gap" ? -1 : 1) - (b.state === "gap" ? -1 : 1)).map((s) => s.label);
  const keyMoments = skills.flatMap((s) => s.evidence.filter((e) => e.tone === "good" && m.events.find((x) => x.seq === e.eventSeq)?.kind === "message").map((e) => ({ eventSeq: e.eventSeq, quote: e.quote, why: e.note, skillId: s.skillId }))).slice(0, 3);
  const consequences = m.events.filter((e) => e.kind === "consequence").map((e) => {
    const mm = e.body.match(/^\*\*(.+?)\.\*\*\s*(.*)$/s);
    return { eventSeq: e.seq, title: mm?.[1] ?? "Consequence", detail: mm?.[2] ?? e.body };
  });
  const nextSteps: NextStep[] = [];
  for (const s of skills.filter((x) => x.state === "gap" || x.state === "developing")) {
    const d = p.drills.find((x) => x.skillId === s.skillId);
    if (!d || nextSteps.some((n) => n.drillId === d.id)) continue;
    const miss = s.evidence.find((e) => e.tone === "miss");
    const why = miss ? `At message ${miss.eventSeq} you wrote "${miss.quote.slice(0, 60)}${miss.quote.length > 60 ? "…" : ""}". ${miss.note}` : `You showed ${s.anchorsMet} of ${s.anchorsTotal} behaviours for "${s.label.toLowerCase()}".`;
    nextSteps.push({ drillId: d.id, skillId: s.skillId, title: d.title, why, estMinutes: d.estMinutes, scaffold: s.state === "gap" ? "hinted" : "unhinted" });
  }
  if (!nextSteps.length && p.drills[0]) nextSteps.push({ drillId: p.drills[0].id, skillId: p.drills[0].skillId, title: p.drills[0].title, why: "You were at target. Prove it holds on fresh material, without a hint.", estMinutes: p.drills[0].estMinutes, scaffold: "unhinted" });
  const rejected = learnerCount > 3 ? 1 : 0;
  db.counters.quotesRejected += rejected;
  const totalMet = skills.reduce((a, s) => a + s.anchorsMet, 0);
  const totalAll = skills.filter((s) => def.skillIds.includes(s.skillId)).reduce((a, s) => a + s.anchorsTotal, 0);
  const roleNoun = p.summary.title.replace(/\s*\(.*\)/, "").toLowerCase();
  return {
    id, missionId: m.id, roleId: m.roleId, createdAt: now(), status: "ready",
    headline: p.headline(strong, gaps),
    summary: `You showed ${totalMet} of ${totalAll} behaviours we look for in this ${m.kind}.${strong.length ? ` Clearest strength: ${strong[0].toLowerCase()}.` : ""}${gaps.length ? ` Biggest opportunity: ${gaps[0].toLowerCase()}.` : ""}`,
    skills, keyMoments, consequences, nextSteps,
    integrity: { judgeModel: "gemini-4-argon", mode: getSettings().runtime, quotesVerified: verified, quotesRejected: rejected, uncertainSkills: skills.filter((s) => s.state === "uncertain").map((s) => s.skillId), notes: ["Scores are formative practice feedback. They are not validated against job performance.", "Code signals are computed first. The judge only adds observations it can back with a verbatim quote.", ...(rejected ? ["One proposed quote was not found word for word in your messages, so the server dropped it."] : []), "Development mock: this report was generated in the browser, not by the live judge."] },
    privacyNote: "Only you can see this report.",
    shareSummary: `I rehearsed a ${roleNoun} first week on Ayden.${strong.length ? ` Strength: ${strong[0].toLowerCase()}.` : ""}${gaps.length ? ` Working on: ${gaps[0].toLowerCase()}.` : " Next: proving it on a fresh variant."}`,
  };
}

/* ───────── progress ───────── */

function readyReports(userId: string, roleId: string) {
  return Object.values(db.reports).filter((r) => r.userId === userId && r.report.roleId === roleId && r.report.status === "ready").map((r) => r.report).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function rampFor(p: RolePack, reports: Report[]): RampMilestone[] {
  const strongSkills = new Set(reports.flatMap((r) => r.skills.filter((s) => s.state === "strong").map((s) => s.skillId)));
  let nextGiven = false;
  return p.ramp.map((r) => {
    if (r.skillIds.length && r.skillIds.every((s) => strongSkills.has(s))) return { ...r, state: "achieved" as const };
    if (r.coveredBy && !nextGiven) { nextGiven = true; return { ...r, state: "next" as const }; }
    return { ...r, state: "planned" as const };
  });
}
function progressFor(userId: string, roleId: RoleId): Progress {
  const p = pack(roleId);
  const reports = readyReports(userId, roleId);
  const ramp = rampFor(p, reports);
  const missions = Object.values(db.missions).filter((m) => m.userId === userId && m.roleId === roleId && !m.setAside).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const u = db.users[userId];
  const onb = u?.onboardings.find((o) => o.roleId === roleId);
  const skills = p.skills.map((sk) => {
    const hist = reports.map((r) => ({ r, s: r.skills.find((x) => x.skillId === sk.def.id)! })).filter((x) => x.s && x.s.state !== "uncertain");
    const last = hist.at(-1)?.s;
    const seeds = new Set(hist.filter((x) => x.s.state === "strong").map((x) => db.missions[x.r.missionId]?.seed));
    return { skillId: sk.def.id, label: sk.def.label, selfRating: (onb?.selfRatings[sk.def.id] as number | undefined) ?? null, target: sk.def.targetLevel, latestAnchorsMet: last?.anchorsMet ?? 0, anchorsTotal: sk.anchors.length, freshVariantsDemonstrated: Math.min(2, seeds.size), history: hist.map((x) => ({ missionId: x.r.missionId, at: x.r.createdAt, anchorsMet: x.s.anchorsMet, kind: db.missions[x.r.missionId]?.kind ?? "mission" })) };
  });
  const badges: Badge[] = [];
  for (const r of reports) for (const s of r.skills) {
    if (s.state !== "strong" || badges.some((b) => b.skillId === s.skillId)) continue;
    const sk = p.skills.find((x) => x.def.id === s.skillId)!;
    badges.push({ id: `b_${s.skillId}`, title: sk.badge.title, description: sk.badge.description, skillId: s.skillId, roleId, earnedAt: r.createdAt, missionId: r.missionId, evidenceSeq: s.evidence.find((e) => e.tone === "good")?.eventSeq ?? s.signals.find((x) => x.met && x.eventSeq)?.eventSeq });
  }
  const days = new Set(Object.values(db.missions).filter((m) => m.userId === userId).map((m) => m.startedAt.slice(0, 10)));
  let streak = 0;
  for (let d = new Date(); days.has(d.toISOString().slice(0, 10)); d.setDate(d.getDate() - 1)) streak += 1;
  return {
    roleId, skills, rampMap: ramp, milestonesAchieved: ramp.filter((r) => r.state === "achieved").length, milestonesTotal: ramp.length, streakDays: streak, badges,
    nextBestDrill: reports.at(-1)?.nextSteps[0] ?? null,
    attempts: missions.map((m) => ({ missionId: m.id, title: fill(defOf(m).title, varsOf(m)), kind: m.kind, at: m.startedAt, status: m.status, ...(m.reportId ? { reportId: m.reportId } : {}) })),
  };
}

/* ───────── cohorts ───────── */

function insightsFor(c: StoredCohort): CohortInsights {
  const seeded = c.seeded || getSettings().seedCohorts;
  const note = "Individual scores are never shown to group leads. Patterns need 5 or more consenting members who finished a mission.";
  if (seeded) {
    const members = Math.max(c.members.length, 23);
    return {
      cohortId: c.cohort.id, minGroupSize: 5, suppressed: false, participation: { members, started: Math.round(members * 0.78), completed: Math.round(members * 0.52) },
      skillPatterns: [
        { roleId: "software-engineer", skillId: "clarify", label: "Ask before you build", pctAtTarget: 64, n: 11 },
        { roleId: "software-engineer", skillId: "verify", label: "Verify before you ship", pctAtTarget: 45, n: 11 },
        { roleId: "software-engineer", skillId: "git_hygiene", label: "Commits and pull requests teammates can follow", pctAtTarget: 27, n: 11 },
        { roleId: "software-engineer", skillId: "feedback", label: "Take review feedback well", pctAtTarget: 73, n: 11 },
        { roleId: "software-engineer", skillId: "team_norms", label: "Read the team's unwritten rules", pctAtTarget: 36, n: 11 },
      ],
      trapPatterns: [
        { trapId: "skip_ticket_key", label: "Left the ticket key out of the commit subject", pctMissed: 73, n: 11 },
        { trapId: "no_edge_test", label: "Shipped without a test for quantity 0 or less", pctMissed: 55, n: 11 },
        { trapId: "no_status", label: "Gave no status update to the manager", pctMissed: 64, n: 11 },
      ],
      dataSource: "seeded-demo", note,
    };
  }
  const consenting = c.members.filter((id) => db.users[id]?.consent?.shareAnonymousPatterns);
  const done = consenting.filter((id) => Object.values(db.missions).some((m) => m.userId === id && m.status === "done"));
  const started = c.members.filter((id) => Object.values(db.missions).some((m) => m.userId === id));
  return { cohortId: c.cohort.id, minGroupSize: 5, suppressed: done.length < 5, participation: { members: c.members.length, started: started.length, completed: done.length }, skillPatterns: [], trapPatterns: [], dataSource: "live", note };
}

/* ───────── router ───────── */

async function route(method: string, url: URL, body: unknown): Promise<unknown> {
  const path = url.pathname.replace(/^\/api\/v1/, "");
  changedThisRequest = new Set();
  const s = getSettings();
  const parts = path.split("/").filter(Boolean);

  if (s.forceError && path !== "/system/status") {
    const code = s.forceError;
    setSettings({ forceError: null });
    const status = ({ unauthenticated: 401, forbidden: 403, not_found: 404, validation: 400, rate_limited: 429, conflict: 409, attempt_cap: 409, consent_required: 403, model_unavailable: 503, internal: 500 } as Record<ErrorCode, number>)[code];
    if (code === "unauthenticated") localStorage.removeItem(SID_KEY);
    throw new HttpError(status, code, ({ rate_limited: "Too many requests.", attempt_cap: "You have used both attempts on this variant.", consent_required: "Consent is required before starting a mission.", model_unavailable: "The model is unavailable." } as Partial<Record<ErrorCode, string>>)[code] ?? "Forced error from the mock panel.", code === "rate_limited" ? 6000 : undefined);
  }

  if (method === "GET" && path === "/health") return { ok: true };

  if (method === "POST" && path === "/session/guest") {
    const id = rid("u");
    const tag = id.slice(-4).toUpperCase();
    db.users[id] = { userId: id, displayName: `Guest ${tag}`, isGuest: true, language: "en", consent: null, onboardings: [], counts: { missionsStarted: 0, missionsCompleted: 0, drillsCompleted: 0 } };
    localStorage.setItem(SID_KEY, id);
    return { me: meOf(db.users[id]) };
  }
  if (path === "/me" && method === "GET") return meOf(currentUser()!);
  if (path === "/me" && method === "PATCH") {
    const u = currentUser()!;
    const b = body as UpdateMeRequest;
    if (b.displayName !== undefined) {
      const n = b.displayName.trim();
      if (n.length < 1 || n.length > 40) throw new HttpError(400, "validation", "Use 1 to 40 characters for your name.");
      u.displayName = n;
    }
    if (b.language) u.language = b.language;
    return meOf(u);
  }
  if (path === "/me" && method === "DELETE") {
    const u = currentUser()!;
    for (const [k, m] of Object.entries(db.missions)) if (m.userId === u.userId) delete db.missions[k];
    for (const [k, r] of Object.entries(db.reports)) if (r.userId === u.userId) delete db.reports[k];
    for (const [k, c] of Object.entries(db.cohorts)) {
      if (c.cohort.ownerId === u.userId) delete db.cohorts[k];
      else c.members = c.members.filter((x) => x !== u.userId);
    }
    delete db.users[u.userId];
    localStorage.removeItem(SID_KEY);
    return { deleted: true };
  }
  if (path === "/me/consent" && method === "PUT") {
    const u = currentUser()!;
    const b = body as UpdateConsentRequest;
    u.consent = { age18: !!b.age18, storeWork: !!b.storeWork, shareAnonymousPatterns: !!b.shareAnonymousPatterns, acceptedAt: now() };
    return meOf(u);
  }
  if (path === "/me/export" && method === "GET") {
    const u = currentUser()!;
    const missions = Object.values(db.missions).filter((m) => m.userId === u.userId).map((m) => ({ id: m.id, roleId: m.roleId, kind: m.kind, seed: m.seed, status: m.status, startedAt: m.startedAt, events: m.events, submitted: m.submitted }));
    return { generatedAt: now(), data: { me: meOf(u), missions, reports: Object.values(db.reports).filter((r) => r.userId === u.userId).map((r) => r.report) } };
  }
  if (path === "/me/progress" && method === "GET") {
    const u = currentUser()!;
    const roleId = (url.searchParams.get("roleId") ?? u.onboardings[0]?.roleId) as RoleId | undefined;
    if (!roleId) throw new HttpError(400, "validation", "Pick a role.");
    return progressFor(u.userId, roleId);
  }
  if (path === "/me/drills" && method === "GET") {
    const u = currentUser()!;
    const roleId = url.searchParams.get("roleId") ?? "";
    return { drills: readyReports(u.userId, roleId).at(-1)?.nextSteps ?? [] };
  }

  if (path === "/roles" && method === "GET") return PACKS.map(summaryOf);
  if (parts[0] === "roles" && parts.length === 2 && method === "GET") {
    const p = pack(parts[1]);
    const u = currentUser(false);
    const detail: RoleDetail = {
      ...summaryOf(p), description: p.description, whatYouWillPractise: p.whatYouWillPractise,
      skills: p.skills.map((s) => ({ ...s.def, anchors: s.anchors.map((a) => a.text) })),
      cast: p.cast, missions: [{ id: p.mission.id, title: fill(p.mission.title, p.variants[0].vars), kind: "mission", estMinutes: p.mission.estMinutes, description: fill(p.mission.description, p.variants[0].vars), skillIds: p.mission.skillIds }],
      rampMap: rampFor(p, u ? readyReports(u.userId, p.summary.id) : []), ...(p.safetyNote ? { safetyNote: p.safetyNote } : {}),
    };
    return detail;
  }

  if (path === "/onboarding" && method === "POST") {
    const u = currentUser()!;
    const b = body as Omit<Onboarding, "completedAt">;
    const p = pack(b.roleId);
    for (const sk of p.skills) {
      const v = b.selfRatings?.[sk.def.id];
      if (!v || v < 1 || v > 5) throw new HttpError(400, "validation", "Rate every skill from 1 to 5.");
    }
    u.onboardings = [...u.onboardings.filter((o) => o.roleId !== b.roleId), { ...b, completedAt: now() }];
    return meOf(u);
  }

  if (path === "/missions" && method === "POST") {
    const u = currentUser()!;
    const b = body as CreateMissionRequest;
    if (!u.consent?.age18 || !u.consent.storeWork) throw new HttpError(403, "consent_required", "We need your consent first.");
    const p = pack(b.roleId);
    if (summaryOf(p).status !== "ready") throw new HttpError(400, "validation", "This role is not available yet.");
    if (!u.onboardings.some((o) => o.roleId === b.roleId)) throw new HttpError(400, "validation", "Complete the short setup for this role first.");
    if (b.mode === "full") throw new HttpError(400, "validation", "Full day mode is planned and not available yet.");
    const drill = b.drillId ? p.drills.find((d) => d.id === b.drillId) : undefined;
    if (b.drillId && !drill) throw new HttpError(404, "not_found", "That drill does not exist.");
    const recent = (db.creations[u.userId] ?? []).filter((t) => Date.now() - t < 3600_000);
    if (recent.length >= 10) throw new HttpError(429, "rate_limited", "You have started 10 rehearsals this hour.", 3600_000 - (Date.now() - recent[0]));
    const defId = drill ? drill.mission.id : p.mission.id;
    const same = Object.values(db.missions).filter((m) => m.userId === u.userId && m.missionDefId === defId).sort((a, b2) => a.startedAt.localeCompare(b2.startedAt));
    const last = same.at(-1);
    let variantIndex = last?.variantIndex ?? 0;
    if (b.reseed && last) {
      variantIndex = (variantIndex + 1) % p.variants.length;
      same.filter((m) => m.status === "active").forEach((m) => { m.setAside = true; });
    }
    if (drill) variantIndex = 0;
    const onVariant = same.filter((m) => m.variantIndex === variantIndex && !m.setAside).length;
    if (onVariant >= 2) throw new HttpError(409, "attempt_cap", "You have used both attempts on this variant. Try a drill or a new variant.");
    db.creations[u.userId] = [...recent, Date.now()];
    const variant = p.variants[variantIndex];
    const m: MockMission = {
      id: rid("m"), userId: u.userId, roleId: b.roleId, missionDefId: defId, ...(drill ? { drillId: drill.id } : {}), kind: drill ? "drill" : "mission",
      seed: drill ? `${variant.seed}-D` : variant.seed, variantIndex, beatIndex: 0, minute: 0, status: "active", events: [], trace: [], files: {}, submitted: {}, submittedSeq: {},
      opened: [], checksRuns: 0, checkReveal: {}, pending: [], acts: {}, firedRules: [], fallbackCursor: {}, replyCount: 0, startedAt: now(), attemptNumber: onVariant + 1,
    };
    db.missions[m.id] = m;
    const def = defOf(m);
    emit(m, { from: "system", kind: "system", body: `${drill ? "Drill" : "Mission"} started · Variant ${m.seed}` }, "engine");
    pushTrace(m, { seq: 1, actor: "Director (Gemini 4 Argon)", model: "gemini-4-argon", type: "proposal", summary: `Wove variant ${m.seed}: ${variant.label}; names, numbers and trap emphasis set from your profile`, verdict: "accepted", latencyMs: rand(1800, 4200) });
    pushTrace(m, { seq: 1, actor: "Engine", type: "validation", summary: `Validated variant against hidden truth and ${def.beats.length}-beat skeleton`, verdict: "accepted" });
    enterBeat(m);
    return stateOf(m);
  }

  if (parts[0] === "missions" && parts[1]) {
    const m = ownMission(parts[1]);
    flush(m);
    if (parts.length === 2 && method === "GET") return stateOf(m);
    if (parts[2] === "events" && method === "GET") {
      const since = Number(url.searchParams.get("since") ?? "0");
      const res: EventsResponse = { events: m.events.filter((e) => e.seq > since), delta: delta(m, changedItems(m)), pending: m.pending.length > 0, trace: since === 0 ? m.trace : m.trace.filter((t) => (t.seq ?? 0) > since) };
      return res;
    }
    if (parts[2] === "act" && method === "POST") return act(m, body as ActRequest);
    if (parts[2] === "finish" && method === "POST") { if (m.status !== "active") throw new HttpError(409, "conflict", "This mission is already finished."); return finish(m); }
    if (parts[2] === "transcript" && method === "GET") {
      if (m.status !== "done") throw new HttpError(409, "conflict", "The transcript is available after the report is ready.");
      const events = m.events.map((e) => (m.checkReveal[e.seq] ? { ...e, meta: { ...e.meta, checks: m.checkReveal[e.seq] } } : e));
      return { events, delta: delta(m), pending: false, trace: m.trace } satisfies EventsResponse;
    }
  }

  if (parts[0] === "reports" && parts[1] && method === "GET") {
    const u = currentUser()!;
    const r = db.reports[parts[1]];
    if (!r || r.userId !== u.userId) throw new HttpError(404, "not_found", "We could not find that report.");
    if (r.report.status === "processing") {
      if (r.pollsLeft > 0) r.pollsLeft -= 1;
      else {
        const m = db.missions[r.report.missionId];
        if (r.fail) { r.report = { ...r.report, status: "failed" }; r.fail = false; m.status = "active"; m.reportId = undefined; }
        else { r.report = buildReport(r.report.id, m); m.status = "done"; }
      }
    } else if (r.report.status === "failed") {
      const m = db.missions[r.report.missionId];
      r.report = buildReport(r.report.id, m);
      m.status = "done";
      m.reportId = r.report.id;
    }
    return r.report;
  }

  if (path === "/cohorts" && method === "GET") {
    const u = currentUser()!;
    return Object.values(db.cohorts).filter((c) => c.cohort.ownerId === u.userId || c.members.includes(u.userId)).map((c) => cohortView(c, u.userId));
  }
  if (path === "/cohorts" && method === "POST") {
    const u = currentUser()!;
    const name = String((body as { name?: string }).name ?? "").trim();
    if (name.length < 3 || name.length > 60) throw new HttpError(400, "validation", "Use 3 to 60 characters for the group name.");
    const prefix = (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "GRP").toUpperCase();
    const code = `${prefix}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const c: StoredCohort = { cohort: { id: rid("c"), name, code, ownerId: u.userId, createdAt: now() }, members: [], seeded: false };
    db.cohorts[c.cohort.id] = c;
    return cohortView(c, u.userId);
  }
  if (path === "/cohorts/join" && method === "POST") {
    const u = currentUser()!;
    const code = String((body as { code?: string }).code ?? "").trim().toUpperCase();
    const c = Object.values(db.cohorts).find((x) => x.cohort.code.toUpperCase() === code);
    if (!c) throw new HttpError(404, "not_found", "No group uses that code. Check it and try again.");
    if (c.cohort.ownerId !== u.userId && !c.members.includes(u.userId)) c.members.push(u.userId);
    return cohortView(c, u.userId);
  }
  if (parts[0] === "cohorts" && parts[2] === "insights" && method === "GET") {
    const u = currentUser()!;
    const c = db.cohorts[parts[1]];
    if (!c) throw new HttpError(404, "not_found", "We could not find that group.");
    if (c.cohort.ownerId !== u.userId) throw new HttpError(403, "forbidden", "Only the group lead can see insights.");
    return insightsFor(c);
  }

  if (path === "/system/status" && method === "GET") {
    const all = Object.values(db.missions);
    const status: SystemStatus = {
      version: "0.1.0-mvp", commit: "mock", region: "browser (mock)", runtime: s.runtime,
      models: [
        { role: "Colleague agents", id: "gemini-4-hydrogen", purpose: "Manager, reviewer, QA, buddy replies via function calling" },
        { role: "Judge + Director", id: "gemini-4-argon", purpose: "Quote-bound judging, scenario weaving" },
        { role: "Drill matching", id: "gemini-embedding-2", purpose: "Match gaps to drills" },
      ],
      googleServices: [
        { name: "Gemini API", state: s.runtime === "live" ? "live" : "fallback", detail: "Colleague agents, judge and director" },
        { name: "Cloud Run", state: "live", detail: "Stateless container serving the API, engine and web app" },
        { name: "Firestore", state: "live", detail: "Sessions, events, reports" },
        { name: "Secret Manager", state: "live", detail: "Model API key mounted at runtime" },
        { name: "Cloud Logging", state: "live", detail: "Structured request and model-call logs" },
        { name: "Gemini code execution", state: "live", detail: "Runs learner code in Google's sandbox" },
        { name: "BigQuery", state: "planned", detail: "Analytics export for the group console" },
        { name: "Sensitive Data Protection", state: "planned", detail: "Redact personal data before storage" },
      ],
      counters: { missionsStarted: all.length, missionsCompleted: all.filter((m) => m.status === "done").length, modelCalls: db.counters.modelCalls, fallbacks: db.counters.fallbacks, quotesVerified: Object.values(db.reports).reduce((a, r) => a + r.report.integrity.quotesVerified, 0), quotesRejected: db.counters.quotesRejected },
    };
    return status;
  }

  throw new HttpError(404, "not_found", `No mock route for ${method} ${path}`);
}

/** Transport used by the API client in mock mode. */
export async function mockTransport(method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const s = getSettings();
  const u = new URL(url, "http://mock.local");
  const cheap = /\/events$|\/act$/.test(u.pathname) && method === "GET";
  if (s.latency) await sleep(cheap ? rand(80, 200) : rand(400, 1200));
  db = load();
  try {
    const out = await route(method, u, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
    save();
    return { status: 200, body: JSON.parse(JSON.stringify(out)) };
  } catch (e) {
    save();
    if (e instanceof HttpError) return { status: e.status, body: { error: { code: e.code, message: e.message, ...(e.retryAfterMs ? { retryAfterMs: e.retryAfterMs } : {}) } } };
    return { status: 500, body: { error: { code: "internal", message: e instanceof Error ? e.message : "Mock server error" } } };
  }
}

export function resetMockData() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(SID_KEY);
  db = load();
}
