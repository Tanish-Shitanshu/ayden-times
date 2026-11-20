import { createHash } from "node:crypto";
import type { MissionEvent } from "@ayden/contract";
import type { Vars } from "./types.js";

/** Deterministic PRNG so a seed always reproduces the same variant. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length)]!;
export const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export function fill(template: string, vars: Vars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
export const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

export function firstSentence(s: string): string {
  const t = s.trim().replace(/^#+\s*/, "");
  const m = t.match(/^[\s\S]*?[.!?](\s|$)/);
  return (m ? m[0] : t.split("\n")[0] ?? t).trim();
}

/** A judge quote is accepted only if it is a (whitespace/case-normalised) substring of the event body. */
export function quoteVerified(quote: string, body: string): boolean {
  const q = norm(quote);
  return q.length >= 3 && norm(body).includes(q);
}

export const learnerEvents = (events: MissionEvent[]) => events.filter((e) => e.from === "you" && e.source === "learner");

/** First learner message matching `re`, optionally to a person and within a seq window. */
export function said(
  events: MissionEvent[],
  re: RegExp,
  opts: { to?: string | string[]; after?: number; before?: number; kind?: MissionEvent["kind"] } = {},
): MissionEvent | undefined {
  const tos = opts.to === undefined ? null : Array.isArray(opts.to) ? opts.to : [opts.to];
  return events.find(
    (e) =>
      e.from === "you" &&
      e.source === "learner" &&
      (opts.kind ? e.kind === opts.kind : e.kind === "message") &&
      (!tos || (e.to && tos.includes(e.to))) &&
      (opts.after === undefined || e.seq > opts.after) &&
      (opts.before === undefined || e.seq < opts.before) &&
      re.test(e.body),
  );
}

export function quoteOf(e: MissionEvent | undefined, re?: RegExp): string | undefined {
  if (!e) return undefined;
  if (re) {
    const m = e.body.match(re);
    if (m) return m[0].slice(0, 140);
  }
  return e.body.slice(0, 140);
}

export const countLines = (s: string) => s.split("\n").length;

/** Number of added + removed lines between two texts (multiset diff; cheap and good enough for scope checks). */
export function diffSize(a: string, b: string): number {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const l of s.split("\n").map((x) => x.trim()).filter(Boolean)) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  let d = 0;
  for (const [l, n] of ca) d += Math.max(0, n - (cb.get(l) ?? 0));
  for (const [l, n] of cb) d += Math.max(0, n - (ca.get(l) ?? 0));
  return d;
}
