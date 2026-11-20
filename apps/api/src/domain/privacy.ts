import type { CohortInsights, RoleId } from "@ayden/contract";
import type { CohortRec, StoredReport, UserRec } from "./types.js";
import { getRole } from "../roles/index.js";

export const MIN_GROUP = 5 as const;

/** Anonymous group patterns. Only users who consented to share, only if at least 5 of them have finished a mission.
 *  Never returns anything per person. */
export function cohortInsights(cohort: CohortRec, members: UserRec[], reports: StoredReport[]): CohortInsights {
  const sharing = members.filter((m) => m.consent?.shareAnonymousPatterns);
  const sharingIds = new Set(sharing.map((m) => m.id));
  const completed = reports.filter((r) => sharingIds.has(r.uid) && r.kind === "mission" && r.status === "ready");
  const completers = new Set(completed.map((r) => r.uid));
  const started = sharing.length;
  const suppressed = completers.size < MIN_GROUP;
  const base: CohortInsights = {
    cohortId: cohort.id,
    minGroupSize: MIN_GROUP,
    suppressed,
    participation: { members: members.length, started, completed: completers.size },
    skillPatterns: [],
    trapPatterns: [],
    dataSource: "live",
    note: "Individual scores are never shown to cohort owners. Only anonymous patterns for groups of 5 or more.",
  };
  if (suppressed) return base;

  // latest mission report per (user, role)
  const latest = new Map<string, StoredReport>();
  for (const r of completed.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latest.set(`${r.uid}:${r.roleId}`, r);
  const byRole = new Map<string, StoredReport[]>();
  for (const r of latest.values()) byRole.set(r.roleId, [...(byRole.get(r.roleId) ?? []), r]);

  for (const [roleId, rs] of byRole) {
    if (rs.length < MIN_GROUP) continue;
    const role = getRole(roleId);
    if (!role) continue;
    for (const sk of role.skills) {
      const tested = rs.filter((r) => r.tested.includes(sk.id));
      if (tested.length < MIN_GROUP) continue;
      const ok = tested.filter((r) => (r.skills.find((s) => s.skillId === sk.id)?.anchorsMet ?? 0) >= sk.targetLevel).length;
      base.skillPatterns.push({ roleId: roleId as RoleId, skillId: sk.id, label: sk.label, pctAtTarget: Math.round((ok / tested.length) * 100), n: tested.length });
    }
    const trapIds = new Set(rs.flatMap((r) => r.traps.map((t) => t.id)));
    for (const id of trapIds) {
      const withTrap = rs.filter((r) => r.traps.some((t) => t.id === id));
      if (withTrap.length < MIN_GROUP) continue;
      const missed = withTrap.filter((r) => r.traps.find((t) => t.id === id)!.missed).length;
      base.trapPatterns.push({ trapId: id, label: withTrap[0]!.traps.find((t) => t.id === id)!.label, pctMissed: Math.round((missed / withTrap.length) * 100), n: withTrap.length });
    }
  }
  return base;
}
