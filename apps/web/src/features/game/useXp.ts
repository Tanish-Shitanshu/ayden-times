import { useEffect } from "react";
import { api } from "../../api/client";
import type { Me, Progress, RoleId } from "../../contract";
import { useApp } from "../../app/store";
import { useAsync } from "../../lib/hooks";
import { computeXp, levelUpSince, loadPlay, questsFor, type Quest, type XpState } from "./xp";

/** Level and quests across every role the learner has tried. Toasts once when the level goes up. */
export function useXp(me: Me | null | undefined, focus?: RoleId): { xp: XpState | null; quests: Quest[]; loading: boolean } {
  const toast = useApp((s) => s.toast);
  const ids = me?.onboardings.map((o) => o.roleId) ?? [];
  const all = useAsync<Progress[]>(async () => {
    if (!me) return [];
    return (await Promise.all(ids.map((r) => api.getProgress(r).catch(() => null)))).filter((p): p is Progress => !!p);
  }, [ids.join(","), me?.counts.missionsCompleted, me?.counts.drillsCompleted]);
  const xp = me && all.data ? computeXp(me, all.data) : null;
  useEffect(() => {
    if (!xp) return;
    const up = levelUpSince(xp.level);
    if (up) toast(`Level up: you are now ${up}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp?.level]);
  const focusProgress = all.data?.find((p) => p.roleId === (focus ?? ids[0])) ?? all.data?.[0] ?? null;
  return { xp, quests: questsFor(focusProgress, loadPlay()), loading: all.loading };
}
