import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/infra/store.js";
import type { LlmClient } from "../src/agents/llm.js";

export class Client {
  cookie = "";
  constructor(private app: FastifyInstance) {}
  async call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown) {
    const res = await this.app.inject({ method, url: `/api/v1${url}`, payload: body as never, headers: this.cookie ? { cookie: this.cookie } : {} });
    const set = res.headers["set-cookie"];
    if (set) this.cookie = String(Array.isArray(set) ? set[0] : set).split(";")[0]!;
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }
  /** Create a guest with consent and onboarding for a role. */
  async enroll(roleId: string, ratings: Record<string, number> = {}) {
    await this.call("POST", "/session/guest", {});
    await this.call("PUT", "/me/consent", { age18: true, storeWork: true, shareAnonymousPatterns: true });
    await this.call("POST", "/onboarding", { roleId, experience: "none", selfRatings: ratings });
  }
}

export async function setup(opts: { llm?: LlmClient } = {}) {
  const store = new MemoryStore();
  const { app, deps } = await buildApp({ store, llm: opts.llm });
  return { app, store, deps, client: () => new Client(app) };
}
