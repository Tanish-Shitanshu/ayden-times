import { randomBytes } from "node:crypto";

const env = process.env;
const nodeEnv = env.NODE_ENV ?? "development";

function sessionSecret(): string {
  const s = env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (nodeEnv === "production") throw new Error("SESSION_SECRET must be set (>= 16 chars) in production");
  return "dev-only-secret-" + randomBytes(8).toString("hex");
}

export type LlmMode = "live" | "scripted" | "cached";

export const config = {
  port: Number(env.PORT ?? 8080),
  nodeEnv,
  isProd: nodeEnv === "production",
  llmMode: (env.LLM_MODE ?? "scripted") as LlmMode,
  geminiKey: env.GEMINI_API_KEY ?? "",
  models: {
    agent: env.MODEL_AGENT ?? "gemini-4-hydrogen",
    reason: env.MODEL_REASON ?? "gemini-4-argon",
    embed: env.MODEL_EMBED ?? "gemini-embedding-2",
    tester: env.MODEL_TESTER ?? "gemini-4-hydrogen",
  },
  store: (env.STORE ?? "memory") as "memory" | "firestore",
  project: env.GOOGLE_CLOUD_PROJECT ?? "",
  firestoreDatabase: env.FIRESTORE_DATABASE ?? "(default)",
  sessionSecret: sessionSecret(),
  /** gemini = Google's code-execution sandbox. local-python = dev/test only, never in production. */
  sandbox: (env.SANDBOX ?? "gemini") as "gemini" | "local-python",
  region: env.CLOUD_RUN_REGION ?? env.REGION ?? "asia-south1",
  version: "0.1.0-mvp",
  commit: env.COMMIT_SHA ?? env.K_REVISION ?? "dev",
  webDir: env.WEB_DIR ?? "",
};

if (config.isProd && config.sandbox === "local-python") {
  throw new Error("SANDBOX=local-python is forbidden in production");
}

export const liveAvailable = () => config.llmMode === "live" && config.geminiKey.length > 0;
