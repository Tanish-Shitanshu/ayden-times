import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    // Domain purity: scenarios and pure domain modules import no I/O.
    files: ["src/roles/**/*.ts", "src/domain/text.ts", "src/domain/privacy.ts", "src/domain/progress.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: ["**/infra/*", "**/api/*", "**/agents/*"] }] },
  },
);
