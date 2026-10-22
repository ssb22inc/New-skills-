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
import { AiGatewayHttpTransport, errorCodes, unfenceJson } from "../../src/gateway-http.ts";
import { LangfuseTraceSink, otelTraceId } from "../../src/langfuse-sink.ts";
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
const SECRET_NAMES = ["OPENROUTER_API_KEY", "AI_GATEWAY_TOKEN", "CLOUDFLARE_API_TOKEN", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "CLICKHOUSE_PASSWORD", "CLICKHOUSE_USER", "AIRBYTE_CLIENT_ID", "AIRBYTE_CLIENT_SECRET"];

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
        // Every registered model routes through OpenRouter (2026-10-21).
        if (env("OPENROUTER_API_KEY")) backend.set(CLIENT, "openrouter-key", env("OPENROUTER_API_KEY"));
        const traceId = `live-${Date.now()}`;
        remoteTraceId = await otelTraceId(CLIENT, traceId);
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

    const callStart = Date.now();
    observations.push(
      await check("langfuse-trace", async () => {
        if (!remoteTraceId) return { pass: false, observed: "no call was made, so there is no trace to read" };
        // The v1 trace read API answers 410 on Langfuse Cloud; v2 reads
        // OBSERVATION rows, filtered by traceId, inside a bounded time window.
        const window = `fromStartTime=${encodeURIComponent(new Date(callStart - 15 * 60_000).toISOString())}&toStartTime=${encodeURIComponent(new Date(Date.now() + 15 * 60_000).toISOString())}`;
        const rows = (body: unknown): { traceId?: unknown }[] => {
          const o = (body ?? {}) as Record<string, unknown>;
          const arr = Array.isArray(o["data"]) ? o["data"] : Object.values(o).find((v) => Array.isArray(v));
          return Array.isArray(arr) ? (arr as { traceId?: unknown }[]) : [];
        };
        let lastStatus = 0;
        for (let i = 0; i < 36; i++) {
          const r = await fetch(`${lfHost}/api/public/v2/observations?traceId=${encodeURIComponent(remoteTraceId)}&${window}&fields=core,basic`, { headers: { authorization: lfAuth } });
          lastStatus = r.status;
          if (r.status === 200) {
            const found = rows(await r.json().catch(() => ({}))).filter((x) => x.traceId === remoteTraceId);
            if (found.length > 0) return { pass: true, observed: `trace ${remoteTraceId} read back: ${found.length} observation row(s) (v2 observations API)` };
          }
          await new Promise((res) => setTimeout(res, 5_000));
        }
        const auth = await fetch(`${lfHost}/api/public/projects`, { headers: { authorization: lfAuth } });
        const listed = await fetch(`${lfHost}/api/public/v2/observations?userId=${encodeURIComponent(CLIENT)}&${window}&limit=5`, { headers: { authorization: lfAuth } });
        const ids = rows(await listed.json().catch(() => ({}))).map((t) => String(t.traceId)).join("; ") || "none";
        return { pass: false, observed: `trace ${remoteTraceId} not found after 180 s (last HTTP ${lastStatus}); keys answer HTTP ${auth.status} on /projects; recent observations for ${CLIENT} (HTTP ${listed.status}): ${ids}` };
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

    // DIAGNOSTICS (informational): which gateway route do the account's
    // Unified Billing credits accept? Each is a 5-token call.
    const diagnostics: { name: string; observed: string }[] = [];
    const probe = async (name: string, url: string, headers: Record<string, string>, model: string) => {
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "Reply with OK." }] }) });
        const text = await r.text();
        const payHeaders = [...r.headers.keys()].filter((h) => /payment|x402|aig/i.test(h)).join(",") || "none";
        let answered = false;
        let shape = "none";
        try {
          const j = JSON.parse(text) as { choices?: { message?: { content?: unknown } }[] };
          answered = Array.isArray(j.choices);
          const c = j.choices?.[0]?.message?.content;
          if (typeof c === "string") {
            const isJson = (x: string) => { try { JSON.parse(x); return true; } catch { return false; } };
            shape = isJson(c) ? "bare-json" : unfenceJson(c) !== c ? "fenced-json" : `other (${c.length} chars)`;
          }
        } catch {
          answered = false;
        }
        diagnostics.push({ name, observed: `HTTP ${r.status}${errorCodes(text)}; answered=${answered}; content=${shape}; response headers ${payHeaders}` });
      } catch (e) {
        diagnostics.push({ name, observed: `threw ${e instanceof Error ? e.name : "error"}` });
      }
    };
    if (account) {
      const rest = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`;
      const restAuth = { authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}`, "cf-aig-gateway-id": "fullburn" };
      await probe("rest-api third-party (anthropic/claude-sonnet-4-5, Cloudflare API token)", rest, restAuth, "anthropic/claude-sonnet-4-5");
      await probe("rest-api workers-ai (@cf/meta/llama-3.3-70b-instruct-fp8-fast, Cloudflare API token)", rest, restAuth, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
      // Read-only token probes: does the token reach THIS account, and does it
      // hold Workers AI? (code 10000 is Cloudflare's generic auth error.)
      try {
        const cf = { authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}` };
        const acc = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=50", { headers: cf });
        const accBody = (await acc.json().catch(() => ({}))) as { result?: { id?: unknown }[] };
        const ids = (accBody.result ?? []).map((a) => String(a.id));
        diagnostics.push({ name: "token accounts", observed: `HTTP ${acc.status}; the token sees ${ids.length} account(s); CLOUDFLARE_ACCOUNT_ID is ${ids.includes(account) ? "AMONG them" : "NOT among them"}` });
        const models = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/models/search?per_page=1`, { headers: cf });
        diagnostics.push({ name: "token Workers AI read (models/search)", observed: `HTTP ${models.status}${errorCodes(await models.text())}` });
      } catch (e) {
        diagnostics.push({ name: "token probes", observed: `threw ${e instanceof Error ? e.name : "error"}` });
      }
      // OpenRouter through the gateway: Cloudflare's page shows two path forms.
      for (const path of ["openrouter/chat/completions", "openrouter/v1/chat/completions"]) {
        await probe(`gateway ${path} (anthropic/claude-sonnet-4.5, gateway token + OpenRouter key)`, `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(account)}/fullburn/${path}`, { "cf-aig-authorization": `Bearer ${env("AI_GATEWAY_TOKEN")}`, authorization: `Bearer ${env("OPENROUTER_API_KEY")}` }, "anthropic/claude-sonnet-4.5");
      }
      await probe("compat (anthropic/claude-sonnet-4-5, gateway token)", `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(account)}/fullburn/compat/chat/completions`, { "cf-aig-authorization": `Bearer ${env("AI_GATEWAY_TOKEN")}` }, "anthropic/claude-sonnet-4-5");
    }

    const tree = git(["hash-object", "--stdin"], git(["ls-files", "-s", "--", ...VERIFIED_TREE_SCOPE]) + "\n");
    const secrets = SECRET_NAMES.map(env);
    const report = renderLiveReport({ phase: "0", tree, commit: git(["rev-parse", "--short", "HEAD"]), startedAt, observations, secrets, diagnostics });
    mkdirSync(`${repo}fullburn/reports`, { recursive: true });
    writeFileSync(`${repo}fullburn/reports/${liveReportName("0", tree)}`, report);
    console.log(report);
    const v = liveVerdict(observations);
    expect(v.failing, "live checks failed — see the report").toEqual([]);
  }, 420_000);
});
