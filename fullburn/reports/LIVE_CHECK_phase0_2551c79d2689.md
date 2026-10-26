# LIVE CHECK phase0
Verdict: FAIL
verified-tree: 2551c79d2689d3e130d0829eb656fa7cc1e661c8

Commit: `4599403`. Started 2026-10-21T18:41:53.220Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: AI Gateway returned HTTP 401 (authentication_error) |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | FAIL | trace fixture-testco:live-1792608113397 was not readable after 90 s; the Langfuse keys at this host answer HTTP 200 on /api/public/projects |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: AI Gateway returned HTTP 401 (authentication_error)
- langfuse-trace: trace fixture-testco:live-1792608113397 was not readable after 90 s; the Langfuse keys at this host answer HTTP 200 on /api/public/projects
