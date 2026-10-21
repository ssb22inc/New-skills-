# LIVE CHECK phase0
Verdict: FAIL
verified-tree: 6343d795160f5f29325b3615a0a2db222bcfbc80

Commit: `1ddbdab`. Started 2026-10-21T19:03:41.681Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 2021) |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | FAIL | trace fixture-testco:live-1792609421949 was not readable after 180 s; keys answer HTTP 200 on /projects; latest traces for fixture-testco (HTTP 410): none |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: AI Gateway returned HTTP 402 (cloudflare 2021)
- langfuse-trace: trace fixture-testco:live-1792609421949 was not readable after 180 s; keys answer HTTP 200 on /projects; latest traces for fixture-testco (HTTP 410): none
