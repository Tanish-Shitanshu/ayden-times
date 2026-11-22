import { defineConfig } from "vitest/config";

/** Runs the role tests over HTTP against a deployed service: AYDEN_BASE_URL=https://... npm run test:live */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    testTimeout: 240000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
