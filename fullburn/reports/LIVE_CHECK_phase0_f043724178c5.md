# LIVE CHECK phase0
Verdict: FAIL
verified-tree: f043724178c57de89f2c8eb50af5eba8f6fe6125

Commit: `5e6144b`. Started 2026-10-21T23:30:06.156Z. Run with the `fullburn` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).

| check | what | status | observed |
|---|---|---|---|
| cloudflare-token | the Cloudflare API token verifies as active | PASS | active (user token) |
| gateway-hello-world | AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer | FAIL | threw Error: Error: Error: model reply is not JSON |
| langfuse-trace | AC1: that call's trace is readable back from the real Langfuse project | PASS | trace 24eed2184608a43517cf8ad3c939c6e7 read back: 1 observation row(s) (v2 observations API) |
| clickhouse-query | the ClickHouse service answers SELECT 1 over HTTPS | PASS | SELECT 1 → 1 |
| airbyte-token | Airbyte issues an access token for the configured application | PASS | access token issued |

Failing:
- gateway-hello-world: threw Error: Error: Error: model reply is not JSON

Diagnostics (informational, not checks):
- rest-api third-party (anthropic/claude-sonnet-4-5, Cloudflare API token): HTTP 404 (cloudflare 7003); answered=false; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-trace-id
- rest-api workers-ai (@cf/meta/llama-3.3-70b-instruct-fp8-fast, Cloudflare API token): HTTP 200; answered=true; response headers cf-aig-cache-status,cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
- token accounts: HTTP 200; the token sees 1 account(s); CLOUDFLARE_ACCOUNT_ID is AMONG them
- token Workers AI read (models/search): HTTP 200
- gateway openrouter/chat/completions (anthropic/claude-sonnet-4.5, gateway token + OpenRouter key): HTTP 200; answered=true; response headers cf-aig-cache-status,cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
- gateway openrouter/v1/chat/completions (anthropic/claude-sonnet-4.5, gateway token + OpenRouter key): HTTP 200; answered=true; response headers cf-aig-cache-status,cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
- compat (anthropic/claude-sonnet-4-5, gateway token): HTTP 402 (cloudflare 2021); answered=false; response headers cf-aig-event-id,cf-aig-log-id,cf-aig-request-id,cf-aig-step,cf-aig-trace-id
