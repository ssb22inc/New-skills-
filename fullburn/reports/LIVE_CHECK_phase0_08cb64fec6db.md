# LIVE CHECK phase0
Verdict: FAIL
verified-tree: 08cb64fec6dbffb260793f2e356b2a7e788d17f0

Commit: `60fd169`. Started 2026-10-22T00:59:45.286Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 402) |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | PASS | trace a5dd05a83be87baa5bb01f6a69c75f9a read back: 1 observation row(s) (v2 observations API) |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 402)

Diagnostics (informational, not checks):
- rest-api third-party (anthropic/claude-sonnet-4-5, Cloudflare API token): HTTP 404 (cloudflare 7003); answered=false; content=none; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-trace-id
- rest-api workers-ai (@cf/meta/llama-3.3-70b-instruct-fp8-fast, Cloudflare API token): HTTP 200; answered=true; content=other (2 chars); response headers cf-aig-cache-status,cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
- token accounts: HTTP 200; the token sees 1 account(s); CLOUDFLARE_ACCOUNT_ID is AMONG them
- token Workers AI read (models/search): HTTP 200
- gateway openrouter/chat/completions (anthropic/claude-sonnet-4.5, gateway token + OpenRouter key): HTTP 402 (cloudflare 402); answered=false; content=none; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
- gateway openrouter/v1/chat/completions (anthropic/claude-sonnet-4.5, gateway token + OpenRouter key): HTTP 402 (cloudflare 402); answered=false; content=none; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
- compat (anthropic/claude-sonnet-4-5, gateway token): HTTP 402 (cloudflare 2021); answered=false; content=none; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
