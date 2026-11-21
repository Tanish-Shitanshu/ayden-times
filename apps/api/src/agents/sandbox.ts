import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../config.js";
import type { LlmClient } from "./llm.js";
import { warn } from "../infra/log.js";

export type Runner = (program: string, timeoutMs?: number) => Promise<string | null>;

const MARK = "AYDEN_RESULTS:";

/** Pull the one JSON results line out of whatever the sandbox printed. */
export function extractResults(strings: string[]): string | null {
  for (const s of strings) {
    const i = s.indexOf(MARK);
    if (i < 0) continue;
    const rest = s.slice(i + MARK.length);
    const line = rest.split("\n")[0]!.trim();
    if (line.startsWith("[")) return line;
  }
  return null;
}

async function runLocalPython(program: string, timeoutMs: number): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "ayden-sbx-"));
  try {
    const file = join(dir, "main.py");
    await writeFile(file, program);
    return await new Promise<string | null>((resolve) => {
      const p = spawn(process.platform === "win32" ? "python" : "python3", ["-I", file], { cwd: dir, env: {}, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
      p.stdout.on("data", (d) => (out += d));
      p.on("close", () => {
        clearTimeout(t);
        resolve(extractResults([out]));
      });
      p.on("error", () => (clearTimeout(t), resolve(null)));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Learner code NEVER runs on our server in production.
 *  - gemini: Google's code-execution sandbox through the Gemini API.
 *  - local-python: development and tests only (refused in production by config).
 * Returns the raw JSON results line, or null when the sandbox is unavailable.
 */
export function makeRunner(llm: LlmClient): Runner {
  return async (program, timeoutMs = 25_000) => {
    if (config.sandbox === "local-python") return runLocalPython(program, Math.min(timeoutMs, 8000));
    if (!llm.live()) return null;
    // The program travels to the sandbox as base64 that the model must copy verbatim. Now and then it
    // garbles a character, so the harness itself fails to decode it. That is not the learner's fault:
    // retry a few times, then fall back to the labelled static checks.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const line = extractResults(await llm.exec(program, timeoutMs));
        if (line === null || !isTransportFailure(line)) return line;
        warn("sandbox transport garbled, retrying", { attempt });
      } catch (e) {
        warn("sandbox exec failed", { error: String((e as Error).message).slice(0, 160) });
        return null;
      }
    }
    return null;
  };
}

/** True when the only result is a load failure caused by the base64 payload, not by the learner's code. */
export function isTransportFailure(line: string): boolean {
  try {
    const arr = JSON.parse(line) as { id?: string; passed?: boolean; msg?: string }[];
    return (
      arr.length === 1 &&
      arr[0]!.id === "load" &&
      arr[0]!.passed === false &&
      /ascii|incorrect padding|invalid base64|non-base64|binascii|character .* base64|invalid character/i.test(arr[0]!.msg ?? "")
    );
  } catch {
    return false;
  }
}
