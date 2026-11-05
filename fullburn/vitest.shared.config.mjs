/** The SHARED-REGISTRY stages (`test:noisolate`, `test:singlefork`): the
 * default config plus ONE setup file. In a shared module registry the
 * production AI Gateway adapter captures the runtime's `fetch` once, when the
 * first test file that reaches it loads — so the live-eval tests, which need
 * their queue-driven stub to BE that runtime fetch (x8 X-04, L12), saw
 * whichever fetch some earlier file left and failed (measured 2026-10-23:
 * 5 tests, every Fullburn CI run since at least 2026-10-21). Installing the
 * stub before any file reproduces, for the whole shared run, exactly what each
 * isolated file already does for itself. The default suite (`npm test`) does
 * not use this file and is unchanged. */
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default mergeConfig(base, defineConfig({ test: { setupFiles: ["engine/test/live-fetch-stub.ts"] } }));
