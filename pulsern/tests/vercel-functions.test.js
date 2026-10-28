/* Vercel's Hobby plan deploys at most 12 serverless functions. Every
   script under api/, at any depth, is a function, unless a file or folder
   on its path starts with an underscore (or a dot). Shared helpers are
   underscored so they never use up the allowance; this keeps the count
   honest and leaves room for new endpoints. */
import { describe, it, expect } from "vitest";
import { readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function functionsIn(dir, rel = "") {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    if (/^[_.]/.test(e.name)) return [];
    const path = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return functionsIn(dir, path);
    return /\.(m?js|cjs|m?ts|cts|jsx|tsx)$/.test(e.name) && !/\.d\.[cm]?ts$/.test(e.name) ? [path] : [];
  });
}

describe("serverless function allowance", () => {
  it("stays within Vercel's 12-function Hobby limit, with room to spare", () => {
    const fns = functionsIn("api");
    expect(fns.length, `api/ functions: ${fns.join(", ")}`).toBeLessThanOrEqual(11);
  });

  it("counts nested routes, and skips underscored files and folders", () => {
    const root = mkdtempSync(join(tmpdir(), "api-"));
    try {
      for (const f of ["a.js", "_shared.js", "admin/status.js", "admin/_helper.js", "_lib/x.js", "deep/er/route.ts", "types.d.ts", "notes.md"]) {
        mkdirSync(join(root, f, ".."), { recursive: true });
        writeFileSync(join(root, f), "");
      }
      expect(functionsIn(root).sort()).toEqual(["a.js", "admin/status.js", "deep/er/route.ts"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
