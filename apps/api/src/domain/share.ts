import { randomBytes } from "node:crypto";
import type { RoleId } from "@ayden/contract";
import { getRole } from "../roles/index.js";
import type { StoredReport } from "./types.js";

/**
 * A shareable work sample. It is built only from what the learner chose to publish: their name, the skills
 * where they reached or neared the target, and a few short quotes from their own words (already verified
 * against the transcript when the report was made). Gaps, hidden facts, scores and the transcript never leave.
 */
export interface WorkSample {
  token: string;
  /** Short id printed on the certificate, e.g. "AYD-7K2M-9QXP". */
  certificateId: string;
  name: string;
  roleId: RoleId;
  roleTitle: string;
  accentHex: string;
  issuedAt: string;
  headline: string;
  skills: { skillId: string; label: string; state: "strong" | "developing"; anchorsMet: number; anchorsTotal: number; target: number }[];
  badges: { id: string; skillId: string; title: string }[];
  moments: { quote: string; why: string; skillLabel: string }[];
  integrity: { quotesVerified: number; mode: "live" | "scripted" | "cached" };
  notice: string;
}

export const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}.' -]{1,58}[\p{L}\p{M}.]$/u;

/** Tidy a typed name: collapse spaces and reject anything that is not a plain personal name. */
export function cleanName(raw: string): string | null {
  const n = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return NAME_RE.test(n) ? n : null;
}

export function newShareToken(reportId: string): string {
  return `${reportId}.${randomBytes(9).toString("base64url")}`;
}

export function reportIdOfToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  return i > 0 ? token.slice(0, i) : null;
}

/** A short, readable id for the certificate, derived from the token (not secret, not reversible to it). */
export function certificateIdOf(token: string): string {
  const tail = token.slice(token.lastIndexOf(".") + 1).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const pad = (tail + "AYDENSAMPLE").slice(0, 8);
  return `AYD-${pad.slice(0, 4)}-${pad.slice(4, 8)}`;
}

export function toWorkSample(r: StoredReport): WorkSample | null {
  if (!r.share || r.status !== "ready") return null;
  const role = getRole(r.roleId);
  if (!role) return null;
  const skills = r.skills
    .filter((s) => s.state === "strong" || s.state === "developing")
    .map((s) => ({ skillId: s.skillId, label: s.label, state: s.state as "strong" | "developing", anchorsMet: s.anchorsMet, anchorsTotal: s.anchorsTotal, target: s.target }));
  const shown = new Set(skills.map((s) => s.skillId));
  const defs = new Map(role.skills.map((d) => [d.id, d]));
  const badges = skills
    .filter((s) => s.state === "strong")
    .map((s) => ({ id: `${r.roleId}:${s.skillId}`, skillId: s.skillId, title: defs.get(s.skillId)?.badge ?? s.label }));
  const labelOf = new Map(skills.map((s) => [s.skillId, s.label]));
  const moments = r.keyMoments
    .filter((m) => shown.has(m.skillId))
    .slice(0, 4)
    .map((m) => ({ quote: m.quote, why: m.why, skillLabel: labelOf.get(m.skillId) ?? "" }));
  return {
    token: r.share.token,
    certificateId: certificateIdOf(r.share.token),
    name: r.share.name,
    roleId: r.roleId,
    roleTitle: role.title,
    accentHex: role.accentHex,
    issuedAt: r.createdAt,
    headline: r.headline,
    skills,
    badges,
    moments,
    integrity: { quotesVerified: r.integrity.quotesVerified, mode: r.integrity.mode },
    notice: "A practice simulation, not an exam or a hiring score. Shown here by the learner. Only skills at or near target are listed, and the quotes are the learner's own words.",
  };
}
