// ESLint, type-aware, and deliberately narrow (human ruling 2026-09-22, DONE.md
// §2.1.7): the defect class this project keeps meeting is an unawaited
// `settle`/`reserve` reaching a production path — a promise whose rejection
// nobody observes. Only a type-aware linter can see that (Biome cannot), so the
// gate is exactly the two rules that catch it, at error, and nothing stylistic.
// A rule here is a rule the mutation harness must be able to turn off and the
// integration suite must catch off — see engine/test/integration/lint-cli.test.ts.
import tseslint from "typescript-eslint";

/** The files the type checker knows (tsconfig.json `include`, kept in step by
 * the invariant suite). Type-aware rules need a program; a file outside it is
 * not silently linted without types — it is outside this gate, said plainly. */
export const LINTED_FILES = Object.freeze([
  "config/src/**/*.ts",
  "config/test/**/*.ts",
  "engine/src/**/*.ts",
  "engine/test/**/*.ts",
  "engine/evals/**/*.ts",
  "vitest.config.ts",
]);

/** The two rules, by name, so a test can assert both are present at "error". */
export const REQUIRED_RULES = Object.freeze({
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
});

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "test-results/**", "reports/**", "**/*.mjs", "**/*.js"] },
  {
    files: [...LINTED_FILES],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: { ...REQUIRED_RULES },
  },
);
