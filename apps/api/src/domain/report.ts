import { randomBytes } from "node:crypto";
import type { Calibration, CloseCall, ConsequenceNote, Evidence, MissionEvent, NextStep, Report, SignalHit, SkillResult } from "@ayden/contract";
import { runJudge } from "../agents/judge.js";
import { rankBySimilarity } from "../agents/weaver.js";
import { config } from "../config.js";
import type { Deps } from "./engine.js";
import { firstSentence, quoteVerified } from "./text.js";
import { TRUST_LABELS, computeTrust } from "./trust.js";
import type { AnchorDef, MissionBuild, RolePack, ScoreCtx, Session, StoredReport, UserRec } from "./types.js";

export function confidenceGap(selfRating: number | null, ratio: number): SkillResult["confidenceGap"] {
  if (selfRating === null) return null;
  const expected = (selfRating - 1) / 4; // 1 -> 0, 5 -> 1
  if (expected - ratio > 0.3) return "overestimated";
  if (ratio - expected > 0.3) return "underestimated";
  return "aligned";
}

/** Compares the rating given before the mission with what the learner showed. Rewards judging yourself accurately, not scoring high. */
export function calibrationOf(skills: SkillResult[]): Calibration | undefined {
  const rated = skills.filter((s) => s.selfRating !== null && s.signals.length > 0 && s.anchorsTotal > 0);
  if (!rated.length) return undefined;
  const rows = rated.map((s) => ({ skillId: s.skillId, label: s.label, said: Math.round(((s.selfRating! - 1) / 4) * 100), showed: Math.round((s.anchorsMet / s.anchorsTotal) * 100), met: s.anchorsMet, total: s.anchorsTotal }));
  const diffs = rows.map((r) => r.said - r.showed);
  const meanAbs = diffs.reduce((a, d) => a + Math.abs(d), 0) / diffs.length;
  const meanSigned = diffs.reduce((a, d) => a + d, 0) / diffs.length;
  const score = Math.max(0, Math.round(100 - meanAbs));
  const verdict: Calibration["verdict"] = meanAbs <= 20 ? "well-calibrated" : meanSigned >= 15 ? "overconfident" : meanSigned <= -15 ? "underconfident" : "mixed";
  const worst = [...rows].sort((a, b) => Math.abs(b.said - b.showed) - Math.abs(a.said - a.showed))[0]!;
  const rated5 = rated.find((s) => s.skillId === worst.skillId)!.selfRating!;
  const summary =
    verdict === "well-calibrated"
      ? "You judged yourself accurately before you started. That is a real skill at work: people who know where they stand ask for help at the right time."
      : verdict === "overconfident"
        ? `You rated yourself higher than you showed. Biggest gap: ${worst.label.toLowerCase()} (you rated ${rated5} of 5, you showed ${worst.met} of ${worst.total} behaviours). That is the useful finding.`
        : verdict === "underconfident"
          ? `You showed more than you expected. Biggest gap: ${worst.label.toLowerCase()} (you rated ${rated5} of 5, you showed ${worst.met} of ${worst.total} behaviours). Trust your preparation a little more.`
          : `Some of your ratings were too high and some too low. Biggest gap: ${worst.label.toLowerCase()} (you rated ${rated5} of 5, you showed ${worst.met} of ${worst.total} behaviours).`;
  return { score, verdict, summary, skills: rows };
}

export function skillState(met: number, target: number): "strong" | "developing" | "gap" {
  if (met >= target) return "strong";
  if (met === target - 1) return "developing";
  return "gap";
}

export async function buildReport(deps: Deps, args: { session: Session; build: MissionBuild; role: RolePack; events: MissionEvent[]; user: UserRec }): Promise<StoredReport> {
  const { session, build, role, events, user } = args;
  const artifacts = Object.fromEntries(Object.entries(session.artifacts).map(([k, v]) => [k, v.content]));
  const finalChecks = build.finalChecks
    ? await build.finalChecks({
        session,
        vars: session.vars,
        events,
        files: session.files,
        artifacts,
        lastChecks: session.lastChecks,
        runner: deps.runner,
      })
    : session.lastChecks;
  const ctx: ScoreCtx = { events, session, vars: session.vars, files: session.files, artifacts, finalChecks, learner: events.filter((e) => e.from === "you" && e.source === "learner") };

  const active = role.anchors.filter((a) => build.activeSkills.includes(a.skillId));
  const judgeAnchors = active.filter((a) => a.kind === "judge");
  const judge = await runJudge(deps.llm, build, events, judgeAnchors);
  if (judge) {
    await deps.store.incr("quotesVerified", judge.verified);
    await deps.store.incr("quotesRejected", judge.rejected);
  }

  const resolve = (a: AnchorDef): { hit: ReturnType<AnchorDef["eval"]>; source: SignalHit["source"] } => {
    if (a.kind === "judge" && judge) {
      const h = judge.hits.get(a.id);
      return { hit: h?.met ? { met: true, seq: h.seq, quote: h.quote } : { met: false, note: a.eval(ctx).note }, source: "judge" };
    }
    return { hit: a.eval(ctx), source: "code" };
  };

  const uncertainSkills = new Set<string>();
  /** A report lists only the skills of the mission it came from, so a role with two missions does not show the other mission's skills as "not tested". */
  const missionDef = role.missions.find((m) => m.id === session.defId) ?? role.missions.find((m) => m.id === role.drills.find((d) => d.id === session.defId)?.missionId);
  const listed = role.skills.filter((sk) => !missionDef || missionDef.skillIds.includes(sk.id) || build.activeSkills.includes(sk.id));
  const skills: SkillResult[] = listed.map((sk) => {
    const own = role.anchors.filter((a) => a.skillId === sk.id);
    const self = user.onboardings.find((o) => o.roleId === role.id)?.selfRatings[sk.id] ?? null;
    if (!build.activeSkills.includes(sk.id)) {
      return { skillId: sk.id, label: sk.label, selfRating: self, anchorsMet: 0, anchorsTotal: own.length, target: sk.targetLevel, state: "uncertain" as const, confidenceGap: null, signals: [], evidence: [] };
    }
    const signals: SignalHit[] = [];
    const evidence: Evidence[] = [];
    let missed: string | undefined;
    let hasUncertain = false;
    for (const a of own) {
      const { hit, source } = resolve(a);
      if (judge?.uncertain.has(a.id)) hasUncertain = true;
      signals.push({ id: a.id, anchor: a.text, met: hit.met, source, ...(hit.seq !== undefined ? { eventSeq: Math.floor(hit.seq) } : {}) });
      const ev = hit.seq !== undefined ? events.find((e) => e.seq === Math.floor(hit.seq!)) : undefined;
      if (hit.quote && ev && quoteVerified(hit.quote, ev.body)) {
        evidence.push({ eventSeq: ev.seq, quote: hit.quote, note: hit.met ? a.text : (hit.note ?? a.text), tone: hit.met ? "good" : "miss", verifiedBySystem: true });
      }
      if (!hit.met && !missed) missed = hit.note;
    }
    const met = signals.filter((s) => s.met).length;
    let state: SkillResult["state"] = skillState(met, sk.targetLevel);
    if (hasUncertain && state !== "strong") {
      state = "uncertain";
      uncertainSkills.add(sk.id);
    }
    const ratio = own.length ? met / own.length : 0;
    return {
      skillId: sk.id,
      label: sk.label,
      selfRating: self,
      anchorsMet: met,
      anchorsTotal: own.length,
      target: sk.targetLevel,
      state,
      confidenceGap: confidenceGap(self, ratio),
      signals,
      evidence: evidence.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "miss" ? -1 : 1)).slice(0, 3),
      ...(state === "gap" || state === "developing" ? (missed ? { missedFact: missed } : {}) : {}),
    };
  });

  const tested = skills.filter((s) => s.signals.length > 0);
  const strong = tested.filter((s) => s.state === "strong");
  const weak = tested.filter((s) => s.state === "gap" || s.state === "developing").sort((a, b) => b.target - b.anchorsMet - (a.target - a.anchorsMet));

  const consequences: ConsequenceNote[] = events
    .filter((e) => e.kind === "consequence")
    .map((e) => ({ eventSeq: e.seq, title: firstSentence(e.body).slice(0, 90), detail: e.body }));

  const nextSteps: NextStep[] = [];
  for (const sk of weak.slice(0, 2)) {
    const candidates = role.drills.filter((d) => d.skillId === sk.skillId && d.id !== session.drillId);
    if (!candidates.length) continue;
    let chosen = candidates[0]!;
    if (candidates.length > 1) {
      const q = `${sk.missedFact ?? ""} ${sk.evidence[0]?.quote ?? ""}`;
      const sims = await rankBySimilarity(deps.llm, q, candidates.map((d) => d.descriptor));
      if (sims) chosen = candidates[sims.indexOf(Math.max(...sims))]!;
    }
    const quote = sk.evidence.find((e) => e.tone === "miss")?.quote ?? sk.evidence[0]?.quote;
    nextSteps.push({
      drillId: chosen.id,
      skillId: sk.skillId,
      title: chosen.title,
      why: quote ? `Your moment at message ${sk.evidence[0]!.eventSeq}: "${quote.slice(0, 90)}"` : `${sk.label}: ${sk.anchorsMet} of ${sk.anchorsTotal} behaviours shown (target ${sk.target}).`,
      estMinutes: chosen.estMinutes,
      scaffold: "hinted",
    });
  }

  const top = strong[0];
  const first = weak[0];
  const headline = top && first ? `Strong on ${top.label.toLowerCase()}. Next: ${first.label.toLowerCase()}.` : first ? `Your first target: ${first.label.toLowerCase()}.` : tested.length ? "Strong across the board on this scenario. Try a fresh variant." : "Mission complete.";
  const summary = `You showed ${tested.reduce((a, s) => a + s.anchorsMet, 0)} of ${tested.reduce((a, s) => a + s.anchorsTotal, 0)} observable behaviours. ${strong.length ? `At target: ${strong.map((s) => s.label.toLowerCase()).join(", ")}. ` : ""}${weak.length ? `Still developing: ${weak.map((s) => s.label.toLowerCase()).join(", ")}.` : ""}`.trim();

  // One moment per message: when a single message backs several behaviours keep the fullest quote.
  const momentsBySeq = new Map<number, { eventSeq: number; quote: string; why: string; skillId: string }>();
  for (const s of tested) {
    for (const e of s.evidence.filter((x) => x.tone === "good")) {
      const prev = momentsBySeq.get(e.eventSeq);
      if (!prev || e.quote.length > prev.quote.length) momentsBySeq.set(e.eventSeq, { eventSeq: e.eventSeq, quote: e.quote, why: e.note, skillId: s.skillId });
    }
  }
  const keyMoments = [...momentsBySeq.values()].slice(0, 3);

  const traps = build.traps.map((t) => ({ id: t.id, label: t.label, missed: t.missed(ctx) }));
  const usedJudge = !!judge;
  const closeCalls: CloseCall[] =
    session.kind === "mission"
      ? build.traps.filter((t) => t.impact).map((t) => ({ id: t.id, label: t.label, caught: !t.missed(ctx), cost: typeof t.impact === "function" ? t.impact(ctx) : t.impact! }))
      : [];
  const trustNow = computeTrust({ build, anchors: role.anchors, session, events, artifacts, finalChecks });
  const colleagueTrust = build.people.filter((p) => build.trust?.[p.id]).map((p) => ({ personId: p.id, name: p.name, level: (trustNow[p.id] ?? 0) as 0 | 1 | 2, label: TRUST_LABELS[trustNow[p.id] ?? 0]! }));
  const calibration = calibrationOf(skills);
  const report: StoredReport = {
    id: "r_" + randomBytes(5).toString("base64url").replace(/[-_]/g, "x"),
    missionId: session.id,
    roleId: role.id,
    createdAt: new Date().toISOString(),
    status: "ready",
    headline,
    summary,
    skills,
    keyMoments,
    consequences,
    nextSteps,
    integrity: {
      judgeModel: usedJudge ? config.models.reason : "rule-based (AI judge unavailable)",
      mode: usedJudge ? "live" : "scripted",
      quotesVerified: judge?.verified ?? 0,
      quotesRejected: judge?.rejected ?? 0,
      uncertainSkills: [...uncertainSkills],
      notes: [
        "Scores are formative practice feedback. They are not validated against job performance.",
        usedJudge ? "Behaviours that need judgement were scored by an AI judge twice; every quote was checked against your words." : "The AI judge was unavailable, so judgement-based behaviours were scored with transparent keyword rules.",
        ...(role.safetyNote ? [role.safetyNote] : []),
      ],
    },
    ...(calibration ? { calibration } : {}),
    ...(closeCalls.length ? { closeCalls } : {}),
    ...(colleagueTrust.length ? { colleagueTrust } : {}),
    privacyNote: "Only you can see this report.",
    shareSummary: `I rehearsed a ${role.title.replace(/ \(.*\)/, "").toLowerCase()} scenario on Ayden. ${strong.length ? `Strength: ${strong[0]!.label.toLowerCase()}.` : "I finished the full scenario."} ${first ? `Working on: ${first.label.toLowerCase()}.` : ""}`.trim(),
    uid: user.id,
    defId: session.defId,
    kind: session.kind,
    drillId: session.drillId,
    variantKey: `${session.defId}:${session.variantIndex}`,
    traps,
    tested: tested.map((s) => s.skillId),
    skillRatios: Object.fromEntries(tested.map((s) => [s.skillId, s.anchorsTotal ? s.anchorsMet / s.anchorsTotal : 0])),
  };
  return report;
}

/** What the learner sees: strip internal fields. */
export function publicReport(r: StoredReport): Report {
  const { uid: _u, defId: _d, kind: _k, variantKey: _v, drillId: _dr, traps: _t, tested: _te, skillRatios: _s, share: _sh, ...rest } = r;
  return rest;
}
