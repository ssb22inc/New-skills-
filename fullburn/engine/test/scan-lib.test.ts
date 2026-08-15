import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { scanContent } from "../scripts/scan-lib.mjs";

/** Verifies the scanner actually detects what it claims (adversary findings
 * F16, F18, F19). Every sample "secret" is assembled at runtime so this file
 * never contains a scannable token literal — the scanner runs over this file
 * too, and secret rules are not exempt for tests. */

const SRC = "fullburn/engine/src/thing.ts";
const fake = (prefix: string, n: number) => prefix + "a1b2c3d4e5".repeat(Math.ceil(n / 10)).slice(0, n);

describe("secret rules (§10.2, §15) — apply to every file type", () => {
  const cases: [string, string][] = [
    ["anthropic", fake("sk-ant-", 24)],
    ["stripe webhook", fake("whsec_", 24)],
    ["aws", "AKIA" + "ABCDEFGHIJKLMNOP"],
    ["github", fake("ghp_", 24)],
    ["meta/facebook", fake("EAA", 30)],
    ["google oauth", fake("ya29.", 30)],
    ["google api key", "AIza" + "b1c2d3e4f5".repeat(4).slice(0, 35)],
    ["slack", fake("xoxb-", 24)],
  ];
  for (const [label, sample] of cases) {
    it(`flags a ${label} token`, () => {
      expect(scanContent(SRC, `const k = "${sample}";`)).toHaveLength(1);
    });
  }

  it("flags tokens in non-code files too — a secret in a report is still a secret", () => {
    expect(scanContent("fullburn/reports/notes.md", fake("sk-ant-", 24)).length).toBeGreaterThan(0);
  });
});

describe("structural rules (Law 1, 6, 11, 18) — code only", () => {
  it("bans LLM provider hostnames outside the gateway (Law 11)", () => {
    expect(scanContent(SRC, 'fetch("https://api.openai.com/v1/chat")')).toHaveLength(1);
    expect(scanContent(SRC, 'fetch("https://api.anthropic.com/v1/messages")')).toHaveLength(1);
  });

  it("bans provider SDK imports in every module form (F16)", () => {
    expect(scanContent(SRC, 'import x from "openai";')).toHaveLength(1);
    expect(scanContent(SRC, 'const x = require("openai");')).toHaveLength(1);
    expect(scanContent(SRC, 'const x = await import("@anthropic-ai/sdk");')).toHaveLength(1);
  });

  it("bans platform API hostnames — reads come from the warehouse (Law 1)", () => {
    expect(scanContent(SRC, 'fetch("https://graph.facebook.com/v21.0/act_1/insights")')).toHaveLength(1);
    expect(scanContent(SRC, 'fetch("https://googleads.googleapis.com/v18/customers")')).toHaveLength(1);
  });

  it("bans prediction-gate identifiers — the market picks winners (Law 6)", () => {
    expect(scanContent(SRC, "if (predictedRoas < 2) return skip;")).toHaveLength(1);
    expect(scanContent(SRC, "const winProbability = model.score(ad);")).toHaveLength(1);
  });

  it("bans direct registry indexing so staged/locked flags stay inert (Law 18, F19)", () => {
    expect(scanContent(SRC, 'const c = CHANNELS["google"];')).toHaveLength(1);
    expect(scanContent("fullburn/config/src/channels.ts", 'const c = CHANNELS[code];')).toHaveLength(0);
  });

  it("bans raw model ids in engine code (§2.4)", () => {
    expect(scanContent(SRC, 'const m = "claude-sonnet";')).toHaveLength(1);
    expect(scanContent("fullburn/config/src/models.ts", 'const m = "claude-sonnet";')).toHaveLength(0);
  });

  it("does not fire structural rules on prose — a doc may discuss what code may not do", () => {
    const prose = 'The engine never calls https://api.openai.com directly; see CHANNELS["google"].';
    expect(scanContent("fullburn/reports/ADVERSARY_REPORT_phase0.md", prose)).toHaveLength(0);
  });

  it("is import-safe: importing the rules runs no filesystem walk (F18)", () => {
    // Reaching this line at all proves it — a walking module would have run
    // (and possibly process.exit'd) during import above.
    expect(typeof scanContent).toBe("function");
  });
});
