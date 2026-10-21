/** THE LIVE CHECK — runs ONLY under `vitest.live.config.ts` (`npm run live`),
 * never in the default suite, and in CI only from `.github/workflows/
 * fullburn-live.yml`, which runs MAIN's own code with the `fullburn` GitHub
 * environment's keys. It talks to the real services, writes
 * `reports/LIVE_CHECK_phase<p>_<tree>.md` whatever happens, and fails if any
 * check did. Every decision — which checks exist, what passes, what the report
 * says, what is redacted — is `engine/scripts/live-lib.mjs`'s, proven by
 * `engine/test/live-lib.test.ts` in the default suite.
 *
 * The hello-world call is a real, billed call, metered against the
 * `fixture-testco` caps (AI: $5/day, $20/month). */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { llm } from "../../src/gateway.ts";
import { AiGatewayHttpTransport } from "../../src/gateway-http.ts";
import { LangfuseTraceSink } from "../../src/langfuse-sink.ts";
import { FrozenCapsSpendMeter } from "../../src/spend-meter.ts";
import { TraceContext } from "../../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../../src/vault.ts";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { liveReportName, liveVerdict, renderLiveReport } from "../../scripts/live-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { VERIFIED_TREE_SCOPE } from "../../scripts/gate-lib.mjs";

type Obs = { id: string; pass: boolean; observed: string };
const CLIENT = "fixture-testco";
const env = (k: string) => process.env[k] ?? "";
const SECRET_NAMES = ["AI_GATEWAY_TOKEN", "CLOUDFLARE_API_TOKEN", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "CLICKHOUSE_PASSWORD", "CLICKHOUSE_USER", "AIRBYTE_CLIENT_ID", "AIRBYTE_CLIENT_SECRET"];

const repo = new URL("../../../../", import.meta.url).pathname;
const git = (args: string[], input?: string) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", input }).trim();

/** One check: never throws, always yields exactly one observation. */
async function check(id: string, fn: () => Promise<{ pass: boolean; observed: string }>): Promise<Obs> {
  try {
    return { id, ...(await fn()) };
  } catch (e) {
    return { id, pass: false, observed: `threw ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}` };
  }
}

describe("live services (fullburn environment)", () => {
  it("every provisioned service answers, and the report is written whatever happens", async () => {
    const startedAt = new Date().toISOString();
    const account = env("CLOUDFLARE_ACCOUNT_ID");
    const lfHost = env("LANGFUSE_HOST").replace(/\/+$/, "");
    const lfAuth = `Basic ${Buffer.from(`${env("LANGFUSE_PUBLIC_KEY")}:${env("LANGFUSE_SECRET_KEY")}`).toString("base64")}`;
    const observations: Obs[] = [];

    observations.push(
      await check("cloudflare-token", async () => {
        const token = env("CLOUDFLARE_API_TOKEN");
        if (!token) return { pass: false, observed: "CLOUDFLARE_API_TOKEN is not set" };
        // A user token verifies at /user; an account-owned token at /accounts/<id>.
        for (const path of ["user/tokens/verify", `accounts/${encodeURIComponent(account)}/tokens/verify`]) {
          const r = await fetch(`https://api.cloudflare.com/client/v4/${path}`, { headers: { authorization: `Bearer ${token}` } });
          const body = (await r.json().catch(() => ({}))) as { success?: boolean; result?: { status?: string } };
          if (r.status === 200 && body.success === true && body.result?.status === "active") return { pass: true, observed: `active (${path.split("/")[0]} token)` };
        }
        return { pass: false, observed: "the token did not verify as active at /user or /accounts/<id>" };
      }),
    );

    let remoteTraceId = "";
    observations.push(
      await check("gateway-hello-world", async () => {
        if (!account || !env("AI_GATEWAY_TOKEN")) return { pass: false, observed: "CLOUDFLARE_ACCOUNT_ID or AI_GATEWAY_TOKEN is not set" };
        if (!lfHost) return { pass: false, observed: "LANGFUSE_HOST is not set — the call cannot be traced, so it is not made" };
        const gatewayBaseUrl = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(account)}/fullburn/`;
        const backend = new MemoryVaultBackend();
        backend.set(CLIENT, "ai-gateway-key", env("AI_GATEWAY_TOKEN"));
        const traceId = `live-${Date.now()}`;
        remoteTraceId = `${encodeURIComponent(CLIENT)}/${encodeURIComponent(traceId)}`;
        const out = (await llm(
          {
            bindings: ROLE_BINDINGS,
            transport: new AiGatewayHttpTransport({ gatewayBaseUrl }),
            vault: vaultForClient(backend, CLIENT),
            meter: new FrozenCapsSpendMeter(),
            sink: new LangfuseTraceSink({ host: lfHost, publicKey: env("LANGFUSE_PUBLIC_KEY"), secretKey: env("LANGFUSE_SECRET_KEY") }),
            gatewayBaseUrl,
            now: () => Date.now(),
          },
          { role: "hello-world", clientId: CLIENT, input: { name: "Fullburn" }, trace: new TraceContext(traceId, CLIENT) },
        )) as { greeting?: unknown };
        return typeof out?.greeting === "string"
          ? { pass: true, observed: `greeting received (${out.greeting.length} chars) via ${ROLE_BINDINGS["hello-world"]}; trace ${remoteTraceId}` }
          : { pass: false, observed: "no greeting in the answer" };
      }),
    );

    observations.push(
      await check("langfuse-trace", async () => {
        if (!remoteTraceId) return { pass: false, observed: "no call was made, so there is no trace to read" };
        // Ingestion is asynchronous: poll for up to 90 s.
        for (let i = 0; i < 18; i++) {
          const r = await fetch(`${lfHost}/api/public/traces/${encodeURIComponent(remoteTraceId)}`, { headers: { authorization: lfAuth } });
          if (r.status === 200) {
            const body = (await r.json().catch(() => ({}))) as { id?: string; observations?: unknown[] };
            if (body.id === remoteTraceId) return { pass: true, observed: `trace ${remoteTraceId} read back with ${Array.isArray(body.observations) ? body.observations.length : 0} observation(s)` };
          }
          await new Promise((res) => setTimeout(res, 5_000));
        }
        return { pass: false, observed: `trace ${remoteTraceId} was not readable after 90 s` };
      }),
    );

    observations.push(
      await check("clickhouse-query", async () => {
        const url = env("CLICKHOUSE_URL");
        if (!url) return { pass: false, observed: "CLICKHOUSE_URL is not set" };
        const r = await fetch(url, {
          method: "POST",
          headers: { authorization: `Basic ${Buffer.from(`${env("CLICKHOUSE_USER")}:${env("CLICKHOUSE_PASSWORD")}`).toString("base64")}` },
          body: "SELECT 1",
        });
        const text = (await r.text()).trim();
        return r.status === 200 && text === "1" ? { pass: true, observed: "SELECT 1 → 1" } : { pass: false, observed: `HTTP ${r.status}` };
      }),
    );

    observations.push(
      await check("airbyte-token", async () => {
        if (!env("AIRBYTE_CLIENT_ID") || !env("AIRBYTE_CLIENT_SECRET")) return { pass: false, observed: "AIRBYTE_CLIENT_ID or AIRBYTE_CLIENT_SECRET is not set" };
        const r = await fetch("https://api.airbyte.com/v1/applications/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_id: env("AIRBYTE_CLIENT_ID"), client_secret: env("AIRBYTE_CLIENT_SECRET") }),
        });
        const body = (await r.json().catch(() => ({}))) as { access_token?: unknown };
        return r.status === 200 && typeof body.access_token === "string" && body.access_token.length > 0
          ? { pass: true, observed: "access token issued" }
          : { pass: false, observed: `HTTP ${r.status}` };
      }),
    );

    const tree = git(["hash-object", "--stdin"], git(["ls-files", "-s", "--", ...VERIFIED_TREE_SCOPE]) + "\n");
    const secrets = SECRET_NAMES.map(env);
    const report = renderLiveReport({ phase: "0", tree, commit: git(["rev-parse", "--short", "HEAD"]), startedAt, observations, secrets });
    mkdirSync(`${repo}fullburn/reports`, { recursive: true });
    writeFileSync(`${repo}fullburn/reports/${liveReportName("0", tree)}`, report);
    console.log(report);
    const v = liveVerdict(observations);
    expect(v.failing, "live checks failed — see the report").toEqual([]);
  }, 300_000);
});
