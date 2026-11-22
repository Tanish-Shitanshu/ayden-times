import type { MissionEvent } from "@ayden/contract";
import type { AnchorDef, MissionBuild, ScoreCtx, Session } from "./types.js";

export const TRUST_LABELS = ["Wary", "Warming up", "Trusts you"] as const;
export type TrustLevel = 0 | 1 | 2;

/** One line the colleague's own model is given, so their tone follows how much they trust the learner. Facts and secrets are unchanged. */
export const TRUST_GUIDANCE: Record<TrustLevel, string> = {
  0: "You are guarded and a little curt. The learner has not yet shown you they are careful. Give short answers and make them earn detail by asking good questions.",
  1: "You are open but still testing the learner. Answer fairly, and notice what they do with it.",
  2: "You trust this learner. Be warmer and give them more room; you may offer a useful pointer unprompted, but still never reveal anything outside WHAT YOU KNOW.",
};

/**
 * Trust per colleague, from what the learner has actually done so far. A colleague's trust is the share of their listed
 * behaviours (anchors) that the learner has shown: none = wary, some = warming up, most = trusts you.
 * Never throws and has no side effects, so it is safe to run after every action.
 */
export function computeTrust(args: { build: MissionBuild; anchors: AnchorDef[]; session: Session; events: MissionEvent[]; artifacts?: Record<string, string>; finalChecks?: ScoreCtx["finalChecks"] }): Record<string, TrustLevel> {
  const { build, anchors, session, events } = args;
  if (!build.trust) return {};
  const artifacts = args.artifacts ?? Object.fromEntries(Object.entries(session.artifacts).map(([k, v]) => [k, v.content]));
  const ctx: ScoreCtx = { events, session, vars: session.vars, files: session.files, artifacts, finalChecks: args.finalChecks ?? null, learner: events.filter((e) => e.from === "you" && e.source === "learner") };
  const out: Record<string, TrustLevel> = {};
  for (const [personId, ids] of Object.entries(build.trust)) {
    let met = 0;
    for (const id of ids) {
      const a = anchors.find((x) => x.id === id);
      if (!a) continue;
      try { if (a.eval(ctx).met) met++; } catch { /* an anchor that cannot be read yet simply does not count */ }
    }
    const share = ids.length ? met / ids.length : 0;
    out[personId] = share >= 0.6 ? 2 : met >= 1 ? 1 : 0;
  }
  return out;
}

export const trustOf = (session: Session): Record<string, TrustLevel> => {
  try { return JSON.parse(String(session.flags.trustJson ?? "{}")) as Record<string, TrustLevel>; } catch { return {}; }
};
export const setTrust = (session: Session, t: Record<string, TrustLevel>) => { session.flags.trustJson = JSON.stringify(t); };
