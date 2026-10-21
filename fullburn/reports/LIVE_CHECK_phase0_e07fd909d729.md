# LIVE CHECK phase0
Verdict: FAIL
verified-tree: e07fd909d72990e60612a30d2d5be822d67fd7a2

Commit: `41a8874`. Started 2026-10-21T19:21:32.278Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 2021) |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | FAIL | trace fixture-testco:live-1792610492447 not found after 180 s (last HTTP 200); keys answer HTTP 200 on /projects; recent observations for fixture-testco (HTTP 200): none |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 2021)
- langfuse-trace: trace fixture-testco:live-1792610492447 not found after 180 s (last HTTP 200); keys answer HTTP 200 on /projects; recent observations for fixture-testco (HTTP 200): none

Diagnostics (informational, not checks):
- rest-api third-party (anthropic/claude-sonnet-4-5, Cloudflare API token): HTTP 401 (cloudflare 10000); answered=false; response headers none
- rest-api workers-ai (@cf/meta/llama-3.3-70b-instruct-fp8-fast, Cloudflare API token): HTTP 401 (cloudflare 10000); answered=false; response headers none
- compat (anthropic/claude-sonnet-4-5, gateway token): HTTP 402 (cloudflare 2021); answered=false; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
