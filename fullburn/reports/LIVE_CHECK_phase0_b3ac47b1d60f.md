# LIVE CHECK phase0
Verdict: FAIL
verified-tree: b3ac47b1d60f032427a02c87e81cdb4d36fa977c

Commit: `c4d10c9`. Started 2026-10-21T18:25:46.026Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: AI Gateway returned HTTP 401 |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | FAIL | trace fixture-testco/live-1792607146190 was not readable after 90 s |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: AI Gateway returned HTTP 401
- langfuse-trace: trace fixture-testco/live-1792607146190 was not readable after 90 s
