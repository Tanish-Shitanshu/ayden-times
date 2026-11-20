import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test", LLM_MODE: "scripted", SANDBOX: "local-python", STORE: "memory", GEMINI_API_KEY: "" },
    testTimeout: 30000,
  },
});
