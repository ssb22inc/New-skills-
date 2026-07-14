import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Stylistic; safe content and noisy in JSX copy.
      "react/no-unescaped-entities": "off",
      // Underscore prefix marks intentionally unused parameters/vars.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/**"],
    rules: {
      // Test doubles and fixtures legitimately reach for `any`.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone k6 / pentest scripts, not part of the Next.js app.
    // k6 idioms (anonymous default export, `check(...) || counter.add(1)`)
    // conflict with app lint rules.
    "load-tests/**",
    "security-tests/**",
  ]),
]);

export default eslintConfig;
