import type { FeedbackRec } from "./types.js";

export interface WallItem {
  id: string;
  name: string;
  college?: string;
  roleId?: string;
  rating: number;
  comment: string;
  photo?: string;
  date: string;
}

export interface TractionSummary {
  updatedAt: string;
  feedbackCount: number;
  testers: number;
  avgRating: number | null;
  /** Net Promoter Score from the 0 to 10 "would you recommend" question, or null with fewer than 5 answers. */
  nps: number | null;
  ratings: number[];
  byRole: { roleId: string; count: number; avgRating: number }[];
  wall: WallItem[];
  /** Platform-wide counters. These include our own testing, so they are labelled as all-time on the page. */
  platform: { missionsStarted: number; missionsCompleted: number; visits?: number; uniqueVisitors?: number };
  /** Measured from real API usage at published paid-tier prices; null until there is enough data. */
  economics: { aiCostPerMissionUsd: number | null; aiCostPerHourUsd: number | null; tokens: number; totalAiCostUsd: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Aggregates only. A tester appears on the wall only when they ticked "show my feedback publicly". */
export function summarise(items: FeedbackRec[], platform: { missionsStarted: number; missionsCompleted: number; visits?: number; uniqueVisitors?: number }, usage: { tokens: number; costMicros: number; measuredMissions: number } = { tokens: 0, costMicros: 0, measuredMissions: 0 }, now = new Date()): TractionSummary {
  const n = items.length;
  const ratings = [1, 2, 3, 4, 5].map((v) => items.filter((f) => f.rating === v).length);
  const answered = items.filter((f) => typeof f.recommend === "number");
  const promoters = answered.filter((f) => f.recommend >= 9).length;
  const detractors = answered.filter((f) => f.recommend <= 6).length;
  const roles = new Map<string, number[]>();
  for (const f of items) if (f.roleId) roles.set(f.roleId, [...(roles.get(f.roleId) ?? []), f.rating]);
  return {
    updatedAt: now.toISOString(),
    feedbackCount: n,
    testers: new Set(items.map((f) => f.uid)).size,
    avgRating: n ? r1(items.reduce((a, f) => a + f.rating, 0) / n) : null,
    nps: answered.length >= 5 ? Math.round(((promoters - detractors) / answered.length) * 100) : null,
    ratings,
    byRole: [...roles.entries()].map(([roleId, rs]) => ({ roleId, count: rs.length, avgRating: r1(rs.reduce((a, b) => a + b, 0) / rs.length) })).sort((a, b) => b.count - a.count),
    wall: items
      .filter((f) => f.showPublicly && f.comment && f.comment.trim().length >= 8)
      .slice(0, 24)
      .map((f) => ({
        id: f.id,
        name: f.name?.trim() || "A tester",
        college: f.college?.trim() || undefined,
        roleId: f.roleId,
        rating: f.rating,
        comment: f.comment!.trim(),
        photo: f.photo,
        date: f.createdAt.slice(0, 10),
      })),
    platform,
    economics: {
      // Average mission is about 22 minutes, so an hour of use is a little under three missions.
      aiCostPerMissionUsd: usage.measuredMissions >= 3 && usage.costMicros > 0 ? Math.round((usage.costMicros / 1e6 / usage.measuredMissions) * 1000) / 1000 : null,
      aiCostPerHourUsd: usage.measuredMissions >= 3 && usage.costMicros > 0 ? Math.round((usage.costMicros / 1e6 / usage.measuredMissions) * (60 / 22) * 1000) / 1000 : null,
      tokens: usage.tokens,
      totalAiCostUsd: Math.round(usage.costMicros / 1e4) / 100,
    },
  };
}
