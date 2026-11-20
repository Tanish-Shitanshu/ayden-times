import type { Badge, Progress, RampMilestone, RoleId, SkillProgress } from "@ayden/contract";
import type { RolePack, StoredReport } from "./types.js";

const day = (iso: string) => iso.slice(0, 10);

export function computeStreak(dates: string[], today = new Date()): number {
  const set = new Set(dates.map(day));
  let streak = 0;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!set.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

export function computeProgress(role: RolePack, reportsAll: StoredReport[], attempts: Progress["attempts"], onboardingRatings: Record<string, number> | null): Progress {
  const reports = reportsAll.filter((r) => r.roleId === role.id && r.status === "ready").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const skills: SkillProgress[] = role.skills.map((sk) => {
    const rel = reports.filter((r) => r.tested.includes(sk.id));
    const latest = rel[rel.length - 1];
    const sr = latest?.skills.find((s) => s.skillId === sk.id);
    const atTargetVariants = new Set(rel.filter((r) => (r.skills.find((s) => s.skillId === sk.id)?.anchorsMet ?? 0) >= sk.targetLevel).map((r) => r.variantKey));
    return {
      skillId: sk.id,
      label: sk.label,
      selfRating: onboardingRatings?.[sk.id] ?? null,
      target: sk.targetLevel,
      latestAnchorsMet: sr?.anchorsMet ?? 0,
      anchorsTotal: role.anchors.filter((a) => a.skillId === sk.id).length,
      freshVariantsDemonstrated: Math.min(2, atTargetVariants.size),
      history: rel.map((r) => ({ missionId: r.missionId, at: r.createdAt, anchorsMet: r.skills.find((s) => s.skillId === sk.id)?.anchorsMet ?? 0, kind: r.kind })),
    };
  });

  const atTarget = (id: string) => (skills.find((s) => s.skillId === id)?.latestAnchorsMet ?? 0) >= (skills.find((s) => s.skillId === id)?.target ?? 99) && (skills.find((s) => s.skillId === id)?.history.length ?? 0) > 0;
  const rampMap: RampMilestone[] = role.rampMap.map((m) => {
    const { requires, ...rest } = m;
    if (!m.coveredBy) return { ...rest, state: "planned" as const };
    const achieved = !!requires?.length && requires.every(atTarget);
    return { ...rest, state: achieved ? ("achieved" as const) : ("next" as const) };
  });

  const badges: Badge[] = [];
  const earned = new Set<string>();
  for (const r of reports) {
    for (const s of r.skills) {
      if (s.signals.length === 0 || s.anchorsMet < s.target || earned.has(s.skillId)) continue;
      earned.add(s.skillId);
      const meta = role.skills.find((x) => x.id === s.skillId)!;
      const ev = s.evidence.find((e) => e.tone === "good");
      badges.push({ id: `${role.id}:${s.skillId}`, title: meta.badge, description: `Showed ${s.anchorsMet} of ${s.anchorsTotal} behaviours for "${meta.label}".`, skillId: s.skillId, roleId: role.id as RoleId, earnedAt: r.createdAt, missionId: r.missionId, ...(ev ? { evidenceSeq: ev.eventSeq } : {}) });
    }
  }

  const latest = reports[reports.length - 1];
  return {
    roleId: role.id as RoleId,
    skills,
    rampMap,
    milestonesAchieved: rampMap.filter((m) => m.state === "achieved").length,
    milestonesTotal: rampMap.length,
    streakDays: computeStreak(reports.map((r) => r.createdAt)),
    badges,
    nextBestDrill: latest?.nextSteps[0] ?? null,
    attempts,
  };
}
