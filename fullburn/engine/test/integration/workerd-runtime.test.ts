import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/** THE ENGINE, EXECUTED UNDER workerd (cross-family finding X6-15, GPT-6 Astra,
 * 2026-10-06). The previous runtime test was Node with its `process` global
 * deleted — not the declared deployment target — and it proved only that the
 * clock REFUSED there, so `llm()` could not run on Workers at all.
 *
 * Human decision 2026-10-06: enable `nodejs_compat`. This test bundles the
 * real engine (FrozenCapsSpendMeter, `llm()`, MemoryTraceSink, the vault),
 * runs it in workerd with the compatibility date and flags READ FROM
 * engine/wrangler.toml, and requires a traced hello-world call. It also runs
 * the same bundle WITHOUT the flag and requires the clock's refusal, so the
 * flag is shown to be the thing that makes the difference.
 *
 * MUTATION: X6-15 — drop `nodejs_compat` from wrangler.toml. */

const ENGINE = fileURLToPath(new URL("../../", import.meta.url));
const WORKERD = fileURLToPath(new URL("../../../node_modules/.bin/workerd", import.meta.url));

function declared(): { date: string; flags: string[] } {
  const toml = readFileSync(join(ENGINE, "wrangler.toml"), "utf8");
  const date = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? "";
  const flags = [...(/^compatibility_flags\s*=\s*\[([^\]]*)\]/m.exec(toml)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  return { date, flags };
}

const ENTRY = `
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm } from "./src/gateway.ts";
import { FrozenCapsSpendMeter } from "./src/spend-meter.ts";
import { MemoryTraceSink, TraceContext } from "./src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "./src/vault.ts";
import { RecordedTransport } from "./src/transport-brand.ts";
export default {
  async fetch() {
    try {
      const backend = new MemoryVaultBackend();
      backend.set("fixture-testco", "ai-gateway-key", "workerd-test-key");
      const sink = new MemoryTraceSink();
      // x9 X-02: outside the test runner a hand-built transport is refused
      // before the credential is read; a recorded transport is served.
      let customRefused = null;
      try {
        await llm(
          { bindings: ROLE_BINDINGS, transport: { async post() { return { greeting: "x" }; } }, vault: vaultForClient(backend, "fixture-testco"),
            meter: new FrozenCapsSpendMeter(), sink: new MemoryTraceSink(), gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/acct/gw/", now: () => Date.now() },
          { role: "hello-world", clientId: "fixture-testco", input: {}, trace: new TraceContext("workerd-0", "fixture-testco") },
        );
        customRefused = false;
      } catch (e) {
        customRefused = /not the production AI Gateway adapter/.test(String(e && e.message));
      }
      const recorded = new RecordedTransport({ hw: { greeting: "hello from workerd" } });
      recorded.setCase("hw");
      const out = await llm(
        {
          bindings: ROLE_BINDINGS,
          transport: recorded,
          vault: vaultForClient(backend, "fixture-testco"),
          meter: new FrozenCapsSpendMeter(),
          sink,
          gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/acct/gw/",
          now: () => Date.now(),
        },
        { role: "hello-world", clientId: "fixture-testco", input: {}, trace: new TraceContext("workerd-1", "fixture-testco") },
      );
      return Response.json({ ok: true, out, traced: sink.events.map((e) => e.outcome), customRefused });
    } catch (e) {
      return Response.json({ ok: false, error: (e && e.constructor && e.constructor.name) + ": " + (e && e.message) });
    }
  },
};
`;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function runUnderWorkerd(bundle: string, date: string, flags: string[]): Promise<{ ok: boolean; out?: unknown; traced?: string[]; error?: string }> {
  const dir = mkdtempSync(join(tmpdir(), "workerd-"));
  const port = await freePort();
  try {
    writeFileSync(join(dir, "worker.js"), bundle);
    writeFileSync(
      join(dir, "config.capnp"),
      `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [ (name = "main", worker = .w) ],
  sockets = [ (name = "http", address = "127.0.0.1:${port}", http = (), service = "main") ],
);
const w :Workerd.Worker = (
  modules = [ (name = "worker", esModule = embed "worker.js") ],
  compatibilityDate = "${date}",
  compatibilityFlags = [ ${flags.map((f) => JSON.stringify(f)).join(", ")} ],
);
`,
    );
    const child = spawn(WORKERD, ["serve", join(dir, "config.capnp")], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    try {
      for (let i = 0; i < 100; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/`);
          return (await r.json()) as { ok: boolean };
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      throw new Error(`workerd never answered:\n${log}`);
    } finally {
      child.kill();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the engine runs on the declared Workers target (X6-15)", () => {
  it("a traced hello-world call succeeds under workerd with wrangler.toml's flags, and the clock refuses without nodejs_compat", async () => {
    // In-memory entry, resolved from the engine directory: nothing is written
    // into the tree while the suite (or the mutation harness) runs.
    const res = await build({ stdin: { contents: ENTRY, resolveDir: ENGINE, loader: "ts", sourcefile: "workerd-entry.ts" }, bundle: true, format: "esm", platform: "neutral", write: false, conditions: ["workerd", "worker", "import"], mainFields: ["module", "main"], logLevel: "silent" });
    const bundle = res.outputFiles[0]!.text;
    const { date, flags } = declared();
    expect(date, "wrangler.toml declares no compatibility_date").not.toBe("");

    const withDeclared = await runUnderWorkerd(bundle, date, flags);
    expect(withDeclared, JSON.stringify(withDeclared)).toMatchObject({ ok: true, out: { greeting: "hello from workerd" }, traced: ["ok"], customRefused: true });

    const withoutCompat = await runUnderWorkerd(bundle, date, flags.filter((f) => f !== "nodejs_compat"));
    expect(withoutCompat.ok, "the engine ran without nodejs_compat — then the flag is not what makes it work").toBe(false);
    expect(withoutCompat.error).toMatch(/no monotonic clock/);
  }, 60_000);
});
