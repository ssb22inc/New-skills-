# LIVE CHECK phase0
Verdict: FAIL
verified-tree: 370af4646a3ab0fd84d838c205f27a5b77d7e4c1

Commit: `5e6ddbb`. Started 2026-10-21T19:56:45.683Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 2021) |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | PASS | trace 9c2532326670837824627379231d1b65 read back: 1 observation row(s) (v2 observations API) |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 2021)

Diagnostics (informational, not checks):
- rest-api third-party (anthropic/claude-sonnet-4-5, Cloudflare API token): HTTP 401 (cloudflare 10000); answered=false; response headers none
- rest-api workers-ai (@cf/meta/llama-3.3-70b-instruct-fp8-fast, Cloudflare API token): HTTP 401 (cloudflare 10000); answered=false; response headers none
- compat (anthropic/claude-sonnet-4-5, gateway token): HTTP 402 (cloudflare 2021); answered=false; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
