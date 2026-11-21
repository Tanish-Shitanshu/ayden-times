import type { Me, Progress } from "../../contract";

/**
 * Ramp level: a private, honest progress ladder. XP only comes from things that really happened
 * (finished missions and drills, skills at target, fresh-variant proof, evidence-linked badges, a daily warm-up).
 * Nothing here is shared, ranked or compared with anyone.
 */

export const LEVELS = [
  { at: 0, title: "Day zero", blurb: "You have not started yet." },
  { at: 100, title: "Intern", blurb: "You have worked your first shift." },
  { at: 250, title: "Contributor", blurb: "You are shipping work others can follow." },
  { at: 450, title: "Reliable teammate", blurb: "People can count on how you work." },
  { at: 750, title: "Owner", blurb: "You close gaps before they are pointed out." },
  { at: 1100, title: "Ramp-ready", blurb: "You have rehearsed the hard parts of the first 90 days." },
] as const;

export const XP_RULES = [
  { label: "Finish a mission", xp: 100 },
  { label: "Finish a drill", xp: 50 },
  { label: "A skill at target", xp: 30 },
  { label: "Prove a skill on a fresh variant", xp: 40 },
  { label: "Earn an evidence-linked badge", xp: 50 },
  { label: "Play Spot the trap (once a day)", xp: 10 },
] as const;

export interface PlayStats { best: number; plays: number; streakDays: number; lastDay: string; days?: number; perfect?: number }
export const PLAY_KEY = "ayden:trap-game";
export function loadPlay(): PlayStats {
  try { return { best: 0, plays: 0, streakDays: 0, lastDay: "", days: 0, perfect: 0, ...JSON.parse(localStorage.getItem(PLAY_KEY) ?? "{}") }; }
  catch { return { best: 0, plays: 0, streakDays: 0, lastDay: "", days: 0, perfect: 0 }; }
}
export const today = () => new Date().toISOString().slice(0, 10);

export interface XpState {
  xp: number;
  level: number; // 0-based index into LEVELS
  title: string;
  blurb: string;
  into: number; // XP inside the current level
  span: number; // XP needed for this level (0 at max)
  toNext: number; // XP left to the next level (0 at max)
  next: string | null;
  parts: { label: string; xp: number }[];
}

export function computeXp(me: Me | null, progress: Progress[], play: PlayStats = loadPlay()): XpState {
  const missions = me?.counts.missionsCompleted ?? 0;
  const drills = me?.counts.drillsCompleted ?? 0;
  let atTarget = 0, fresh = 0, badges = 0;
  for (const p of progress) {
    badges += p.badges.length;
    for (const s of p.skills) {
      if (s.latestAnchorsMet >= s.target && s.history.length > 0) atTarget++;
      fresh += s.freshVariantsDemonstrated;
    }
  }
  const parts = [
    { label: "Missions finished", xp: missions * 100 },
    { label: "Drills finished", xp: drills * 50 },
    { label: "Skills at target", xp: atTarget * 30 },
    { label: "Fresh-variant proof", xp: fresh * 40 },
    { label: "Badges", xp: badges * 50 },
    { label: "Warm-up days", xp: (play.days ?? 0) * 10 },
  ].filter((x) => x.xp > 0);
  const xp = parts.reduce((a, b) => a + b.xp, 0);
  let level = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]!.at) level = i;
  const cur = LEVELS[level]!;
  const nxt = LEVELS[level + 1];
  return { xp, level, title: cur.title, blurb: cur.blurb, into: xp - cur.at, span: nxt ? nxt.at - cur.at : 0, toNext: nxt ? nxt.at - xp : 0, next: nxt?.title ?? null, parts };
}

export interface Quest { id: string; title: string; hint: string; done: boolean; to?: string }

/** Three small things for today, each tied to real progress. They award nothing extra: the XP is in the work itself. */
export function questsFor(progress: Progress | null, play: PlayStats = loadPlay()): Quest[] {
  const day = today();
  const doneToday = !!progress?.attempts.some((a) => a.status === "done" && a.at.slice(0, 10) === day);
  const drillToday = !!progress?.attempts.some((a) => a.kind === "drill" && a.status === "done" && a.at.slice(0, 10) === day);
  return [
    { id: "warm", title: "Warm up with Spot the trap", hint: "Six moments, about a minute.", done: play.lastDay === day, to: "/play" },
    { id: "shift", title: "Finish a mission or a drill today", hint: "25 minutes, or 6 for a drill.", done: doneToday },
    { id: "gap", title: progress?.nextBestDrill ? `Close a gap: ${progress.nextBestDrill.title}` : "Take one skill to target", hint: "A short drill on your recommended skill.", done: drillToday },
  ];
}

const SEEN = "ayden:level-seen";
/** Returns the new level title once, when the learner has just moved up. */
export function levelUpSince(level: number): string | null {
  let seen = -1;
  try { seen = Number(localStorage.getItem(SEEN) ?? "-1"); } catch { /* ignore */ }
  if (seen < 0) { try { localStorage.setItem(SEEN, String(level)); } catch { /* ignore */ } return null; }
  if (level > seen) { try { localStorage.setItem(SEEN, String(level)); } catch { /* ignore */ } return LEVELS[level]!.title; }
  return null;
}
