import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

/** THE CROSS-FAMILY RUNNER, EXECUTED against a local stand-in router. What
 * this proves: the runner refuses without a key, refuses a served model that
 * is not the pinned reviewer, refuses a non-contract answer, and writes a
 * correctly headed report otherwise. What it cannot prove, by construction: a
 * PASS — `crossVerdict` forces FAIL on any endpoint but the production router,
 * and this file asserts that a stand-in that says PASS still yields a FAIL
 * report. The stand-in is the negative case, never a green one. */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const RUNNER = `${ROOT}/engine/scripts/cross-family-read.mjs`;
const REPORTS = `${ROOT}/reports`;
const before = new Set(readdirSync(REPORTS));
let server: Server | null = null;

const shellEnv = (extra: Record<string, string | undefined>) => {
  const env: Record<string, string | undefined> = { ...process.env, ...extra };
  delete env["VITEST"];
  return env;
};
/** ASYNC, NOT spawnSync: the stand-in server lives in THIS worker, and a
 * synchronous spawn blocks the loop the server needs to answer — the runner
 * then waits on a reply that can never come (measured: 60 s to the timeout,
 * 2026-09-22). A development tree is dirty; the runner honours allow-dirty
 * only off the production router, and every stand-in run here is off it. */
const run = (env: Record<string, string | undefined>, args: string[] = []) =>
  new Promise<{ code: number | null; out: string }>((res) => {
    const c = spawn(process.execPath, [RUNNER, ...args], { cwd: ROOT, env: shellEnv({ FULLBURN_CROSS_FAMILY_ALLOW_DIRTY: "1", ...env }), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => c.kill("SIGKILL"), 30_000);
    c.on("close", (code) => {
      clearTimeout(t);
      res({ code, out });
    });
  });
const newReports = () => readdirSync(REPORTS).filter((n) => !before.has(n));
const serve = (reply: (body: string) => { status: number; json: unknown }) =>
  new Promise<string>((res) => {
    server = createServer((req, resp) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const { status, json } = reply(body);
        resp.writeHead(status, { "content-type": "application/json" });
        resp.end(JSON.stringify(json));
      });
    }).listen(0, "127.0.0.1", () => res(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1/chat/completions`));
  });
const answer = (model: string, content: string, id = "gen-test") => ({ id, model, choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const cleanReview = JSON.stringify({ verdict: "PASS", findings: [], invariants_checked: ["x"], limitations: ["read only"] });

afterEach(() => {
  server?.close();
  server = null;
  for (const n of newReports()) rmSync(`${REPORTS}/${n}`, { force: true });
});

describe("cross-family runner — fails closed at every step before a report exists", () => {
  it("refuses inside a test worker", () => {
    const r = spawnSync(process.execPath, [RUNNER], { cwd: ROOT, encoding: "utf8", env: { ...process.env, VITEST: "true" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/test worker/);
  });

  /** MUTATION: XF-05 — the missing-key refusal is removed. */
  it("without OPENROUTER_API_KEY it says NOT CONFIGURED, exits 2, and writes nothing", async () => {
    const r = await run({ OPENROUTER_API_KEY: undefined });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/NOT CONFIGURED/);
    expect(newReports()).toEqual([]);
  });

  it("dry run builds the request from the real tree, sends nothing, and exits 3 so it can never read as a read", async () => {
    const r = await run({ OPENROUTER_API_KEY: undefined }, ["--dry-run"]);
    expect(r.code, r.out).toBe(3);
    expect(r.out).toMatch(/DRY RUN/);
    expect(r.out).toMatch(/tree [0-9a-f]{40} \(\d+ files, \d+ bytes/);
    expect(newReports()).toEqual([]);
  });

  it("allow-dirty does nothing on the production router: a dirty tree refuses before any network", async () => {
    // No stand-in: the endpoint is production. The key is fake and nothing is
    // sent, because the refusal comes first — and this only proves anything
    // while the tree IS dirty, so assert that precondition.
    const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() !== "";
    if (!dirty) return; // a clean CI checkout cannot drive this case; the lib test drives the decision
    const r = await run({ OPENROUTER_API_KEY: "test-key", FULLBURN_CROSS_FAMILY_ENDPOINT: undefined });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/dirty/);
    expect(newReports()).toEqual([]);
  });

  it("a served model that is not the pinned reviewer writes no report", async () => {
    const url = await serve(() => ({ status: 200, json: answer("anthropic/claude-opus-5", cleanReview) }));
    const r = await run({ OPENROUTER_API_KEY: "test-key", FULLBURN_CROSS_FAMILY_ENDPOINT: url });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not the pinned reviewer|builder's family/);
    expect(newReports()).toEqual([]);
  });

  it("an answer that is not the contract writes no report (the raw answer is kept for inspection)", async () => {
    const url = await serve(() => ({ status: 200, json: answer("openai/gpt-6-astra", "I think it is fine.") }));
    const r = await run({ OPENROUTER_API_KEY: "test-key", FULLBURN_CROSS_FAMILY_ENDPOINT: url });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not the contract/);
    expect(newReports().filter((n) => n.endsWith(".md"))).toEqual([]);
  });

  it("a router error writes no report", async () => {
    const url = await serve(() => ({ status: 402, json: { error: { message: "insufficient credits" } } }));
    const r = await run({ OPENROUTER_API_KEY: "test-key", FULLBURN_CROSS_FAMILY_ENDPOINT: url });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/router error 402/);
    expect(newReports()).toEqual([]);
  });

  it("a contract answer from the pinned reviewer writes a correctly headed report — and a stand-in's PASS is still a FAIL", async () => {
    let received = "";
    const url = await serve((body) => {
      received = body;
      return { status: 200, json: answer("openai/gpt-6-astra", cleanReview, "gen-abc") };
    });
    const r = await run({ OPENROUTER_API_KEY: "test-key", FULLBURN_CROSS_FAMILY_ENDPOINT: url });
    // The stand-in said PASS; the endpoint is not production; the report says FAIL.
    expect(r.code).toBe(1);
    const md = newReports().find((n) => /^ADVERSARY_REPORT_phase0\.x\d+\.md$/.test(n));
    expect(md, r.out).toBeDefined();
    const text = readFileSync(`${REPORTS}/${md}`, "utf8");
    const lines = text.split("\n");
    expect(lines[1]).toBe("Verdict: FAIL");
    expect(lines[2]).toMatch(/^verified-tree: [0-9a-f]{40}$/);
    expect(lines[4]).toBe("Reviewer-family: OpenAI (gpt-6-astra via OpenRouter)");
    expect(text).toMatch(/not the production router/);
    expect(text).toContain("Response id: gen-abc");
    expect(r.out).toMatch(/sha256 [0-9a-f]{64}/);
    // The request carried the human-owned definition and the real tree.
    const req = JSON.parse(received);
    expect(req.model).toBe("openai/gpt-6-astra");
    expect(req.messages[0].content).toContain("You are the adversary.");
    expect(req.messages[1].content).toContain("===== FILE: fullburn/engine/src/gateway.ts");
    expect(req.provider).toEqual({ allow_fallbacks: false });
    // No partial left behind.
    expect(existsSync(`${REPORTS}/${md}.partial`)).toBe(false);
  });
});
