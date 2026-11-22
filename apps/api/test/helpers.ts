import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/infra/store.js";
import type { LlmClient } from "../src/agents/llm.js";

export class Client {
  cookie = "";
  /** With BASE_URL set the same tests run over HTTP against a deployed service (live Gemini), instead of in-process. */
  constructor(private app: FastifyInstance | null, private base = process.env.AYDEN_BASE_URL ?? "") {}
  async call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown) {
    if (this.base) {
      const res = await fetch(`${this.base}/api/v1${url}`, { method, headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.get("set-cookie");
      if (set) this.cookie = set.split(";")[0]!;
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    }
    const res = await this.app!.inject({ method, url: `/api/v1${url}`, payload: body as never, headers: this.cookie ? { cookie: this.cookie } : {} });
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
  if (process.env.AYDEN_BASE_URL) return { app: null as never, store: null as never, deps: null as never, client: () => new Client(null) };
  const store = new MemoryStore();
  const { app, deps } = await buildApp({ store, llm: opts.llm });
  return { app, store, deps, client: () => new Client(app) };
}

import type { ToolCall, ToolDecl, ToolResult } from "../src/agents/llm.js";

export interface FakeHandlers {
  structured?: (a: { schema: Record<string, any>; input: string; system?: string }) => unknown;
  toolCall?: (a: { system: string; input: string; tools: ToolDecl[] }) => { calls: ToolCall[]; text?: string } | undefined;
  exec?: (program: string) => string[];
}

/** A stand-in for Gemini that lets tests drive live-mode code paths without a network. */
export class FakeLlm implements LlmClient {
  structuredCalls = 0;
  toolCalls = 0;
  constructor(public h: FakeHandlers = {}) {}
  live() { return true; }
  fallbackReason() { return undefined; }
  async structured(a: { model: string; system?: string; input: string; schema: Record<string, unknown> }) {
    this.structuredCalls++;
    const d = this.h.structured?.(a as never);
    if (d === undefined) throw new Error("no structured handler");
    return { data: d, latencyMs: 5, model: a.model };
  }
  async toolCall(a: { model: string; system: string; input: string; tools: ToolDecl[] }): Promise<ToolResult> {
    this.toolCalls++;
    const r = this.h.toolCall?.(a);
    if (!r) throw new Error("no toolCall handler");
    return { calls: r.calls, text: r.text ?? "", latencyMs: 5, model: a.model };
  }
  async embed(texts: string[]) { return texts.map((t, i) => [t.length, i + 1, 1]); }
  async exec(p: string) { return this.h.exec?.(p) ?? []; }
}
