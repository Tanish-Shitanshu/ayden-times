import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { ApiError } from "../domain/engine.js";
import type { UserRec } from "../domain/types.js";
import type { Store } from "../infra/store.js";

export const COOKIE = "ayden_sid";

const sign = (uid: string) => createHmac("sha256", config.sessionSecret).update(uid).digest("base64url");

export const newUserId = () => "u_" + randomBytes(9).toString("base64url").replace(/[-_]/g, "x");

export function setSession(reply: FastifyReply, uid: string) {
  reply.setCookie(COOKIE, `${uid}.${sign(uid)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: "/" });
}

export function readUid(req: FastifyRequest): string | null {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const uid = raw.slice(0, i);
  const mac = Buffer.from(raw.slice(i + 1));
  const expect = Buffer.from(sign(uid));
  return mac.length === expect.length && timingSafeEqual(mac, expect) ? uid : null;
}

export async function requireUser(req: FastifyRequest, store: Store): Promise<UserRec> {
  const uid = readUid(req);
  const user = uid ? await store.getUser(uid) : null;
  if (!user) throw new ApiError(401, "unauthenticated", "Your session ended.");
  return user;
}

/** Tiny in-memory sliding-window limiter (per instance). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  check(key: string): number | null {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) return this.windowMs - (now - arr[0]!);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.clear();
    return null;
  }
}
