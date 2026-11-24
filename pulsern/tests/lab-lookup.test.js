/* The drawer's AI lookup must behave exactly as before the toolkit
   redesign: same prompt, same provider and token budget, same error text,
   same built-in match rule. The server door (/api/ai: 401 without a
   signed-in user) is pinned in tests/ai-auth.test.js. */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { LAB_GROUPS } from "../src/labs.js";
import {
  LAB_AI_PROVIDER, LAB_AI_MAX_TOKENS, LAB_AI_ERROR, LAB_AI_NOTE, LAB_DISCLAIMER,
  labAiPrompt, filterLabGroups, runLabLookup,
} from "../src/lab-lookup.js";

const ORIGINAL = readFileSync(new URL("./fixtures/lab-ai-prompt.txt", import.meta.url), "utf8");

describe("lab AI lookup contract", () => {
  it("sends the original prompt byte for byte", () => {
    expect(labAiPrompt("magnesium")).toBe(ORIGINAL.replace("${query}", "magnesium"));
    expect(labAiPrompt("x")).toMatch(/never real-world dosing or treatment instructions\.$/);
  });
  it("uses the same provider and budget", async () => {
    expect(LAB_AI_PROVIDER).toBe("deepseek");
    expect(LAB_AI_MAX_TOKENS).toBe(400);
    const ask = vi.fn(async () => "Magnesium: 1.5–2.5 mEq/L");
    await expect(runLabLookup(ask, "magnesium")).resolves.toBe("Magnesium: 1.5–2.5 mEq/L");
    expect(ask).toHaveBeenCalledWith("deepseek", labAiPrompt("magnesium"), 400);
  });
  it("shows the same message on any failure (401, 502, empty)", async () => {
    for (const msg of ["Sign in first", "Upstream failed", "EMPTY"]) {
      await expect(runLabLookup(async () => { throw new Error(msg); }, "q")).resolves.toBe(LAB_AI_ERROR);
    }
    expect(LAB_AI_ERROR).toBe("The AI lookup is unavailable right now. Try again in a moment.");
  });
  it("keeps the verify-against-your-materials notes (CLAUDE.md rule 7)", () => {
    expect(LAB_AI_NOTE).toMatch(/Verify it against your course materials/);
    expect(LAB_DISCLAIMER).toMatch(/verify against your course materials/);
  });
  it("matches built-in ranges by name, value, or group as before", () => {
    const all = filterLabGroups(LAB_GROUPS, "");
    expect(all).toHaveLength(LAB_GROUPS.length);
    const k = filterLabGroups(LAB_GROUPS, "  POTASSIUM ");
    expect(k.flatMap((g) => g.rows.map(([n]) => n)).some((n) => /potassium/i.test(n))).toBe(true);
    expect(filterLabGroups(LAB_GROUPS, "abg").map((g) => g.group)).toContain("ABG");
    expect(filterLabGroups(LAB_GROUPS, "what is preload")).toEqual([]);
  });
});
