import { GoogleGenAI } from "@google/genai";
import { config, liveAvailable } from "../config.js";
import type { Store } from "../infra/store.js";
import { warn } from "../infra/log.js";

export interface ToolDecl {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}
export interface ToolResult {
  calls: ToolCall[];
  text: string;
  latencyMs: number;
  model: string;
}

/** What the rest of the app depends on. Tests inject a fake; production uses GeminiLlm. */
export interface LlmClient {
  /** true when real model calls are possible right now */
  live(): boolean;
  /** why we are not live (for the UI banner) */
  fallbackReason(): string | undefined;
  structured(args: { model: string; system?: string; input: string; schema: Record<string, unknown>; timeoutMs?: number }): Promise<{ data: unknown; latencyMs: number; model: string }>;
  toolCall(args: { model: string; system: string; input: string; tools: ToolDecl[]; timeoutMs?: number }): Promise<ToolResult>;
  embed(texts: string[]): Promise<number[][]>;
  /** Run Python in Google's sandbox through the code-execution tool. Returns every string the sandbox produced. */
  exec(program: string, timeoutMs?: number): Promise<string[]>;
}

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

function collectStrings(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || v === null || v === undefined) return out;
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out, depth + 1));
  else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => collectStrings(x, out, depth + 1));
  return out;
}

export class GeminiLlm implements LlmClient {
  private client: GoogleGenAI | null = null;
  private failures = 0;
  private openUntil = 0;

  constructor(private store: Store) {}

  private get ai(): GoogleGenAI {
    if (!this.client) this.client = new GoogleGenAI({ apiKey: config.geminiKey });
    return this.client;
  }

  live(): boolean {
    return liveAvailable() && Date.now() >= this.openUntil;
  }

  fallbackReason(): string | undefined {
    if (config.llmMode !== "live") return `LLM_MODE is ${config.llmMode}`;
    if (!config.geminiKey) return "No model key is configured";
    if (Date.now() < this.openUntil) return "The AI model is temporarily unavailable (circuit breaker open)";
    return undefined;
  }

  private async guarded<T>(label: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    if (!this.live()) throw new Error("llm not live");
    const attempt = async () => withTimeout(fn(), timeoutMs, label);
    try {
      await this.store.incr("modelCalls");
      let result: T;
      try {
        result = await attempt();
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        if (/429|5\d\d|UNAVAILABLE|RESOURCE_EXHAUSTED|timed out/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
          await this.store.incr("modelCalls");
          result = await attempt();
        } else throw e;
      }
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures += 1;
      if (this.failures >= 3) {
        this.openUntil = Date.now() + 60_000;
        this.failures = 0;
        warn("llm circuit breaker opened for 60s", { label });
      }
      throw e;
    }
  }

  async structured(args: { model: string; system?: string; input: string; schema: Record<string, unknown>; timeoutMs?: number }) {
    const t0 = Date.now();
    const res = await this.guarded("structured", args.timeoutMs ?? 40_000, () =>
      (this.ai as any).interactions.create({
        model: args.model,
        input: args.input,
        ...(args.system ? { system_instruction: args.system } : {}),
        response_format: { type: "text", mime_type: "application/json", schema: args.schema },
      }),
    );
    const text: string = (res as any).output_text ?? "";
    return { data: JSON.parse(text), latencyMs: Date.now() - t0, model: args.model };
  }

  async toolCall(args: { model: string; system: string; input: string; tools: ToolDecl[]; timeoutMs?: number }): Promise<ToolResult> {
    const t0 = Date.now();
    const res = await this.guarded("toolCall", args.timeoutMs ?? 20_000, () =>
      (this.ai as any).interactions.create({
        model: args.model,
        input: args.input,
        system_instruction: args.system,
        tools: args.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })),
      }),
    );
    const steps: any[] = (res as any).steps ?? [];
    const calls: ToolCall[] = steps
      .filter((s) => s.type === "function_call")
      .map((s) => ({ name: String(s.name), args: (s.arguments ?? {}) as Record<string, unknown> }));
    return { calls, text: String((res as any).output_text ?? ""), latencyMs: Date.now() - t0, model: args.model };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.guarded("embed", 20_000, () =>
      (this.ai as any).models.embedContent({ model: config.models.embed, contents: texts }),
    );
    const embs: any[] = (res as any).embeddings ?? [];
    return embs.map((e) => e.values as number[]);
  }

  async exec(program: string, timeoutMs = 25_000): Promise<string[]> {
    const prompt =
      "Run the Python program below with the code execution tool exactly as written. Do not edit it. " +
      "When it finishes, reply with only the line it printed that starts with AYDEN_RESULTS:\n\n```python\n" +
      program +
      "\n```";
    const res = await this.guarded("exec", timeoutMs, () =>
      (this.ai as any).interactions.create({ model: config.models.tester, input: prompt, tools: [{ type: "code_execution" }] }),
    );
    const steps: any[] = (res as any).steps ?? [];
    // Prefer sandbox output steps over model prose.
    const sandbox = steps.filter((s) => String(s.type).includes("code_execution_result")).flatMap((s) => collectStrings(s));
    return sandbox.length ? sandbox : collectStrings(steps);
  }
}

/** Deterministic stand-in: never live. Used when no key is set and in unit tests. */
export class OfflineLlm implements LlmClient {
  live() {
    return false;
  }
  fallbackReason() {
    return config.llmMode !== "live" ? `LLM_MODE is ${config.llmMode}` : "No model key is configured";
  }
  async structured(): Promise<never> {
    throw new Error("offline");
  }
  async toolCall(): Promise<never> {
    throw new Error("offline");
  }
  async embed(): Promise<never> {
    throw new Error("offline");
  }
  async exec(): Promise<never> {
    throw new Error("offline");
  }
}

export function createLlm(store: Store): LlmClient {
  return liveAvailable() ? new GeminiLlm(store) : new OfflineLlm();
}
