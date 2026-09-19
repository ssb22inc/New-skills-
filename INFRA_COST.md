# INFRA_COST.md — what Sycamore costs to run

BUILD §5 sets the target: **infra + tools under US$700/mo pre-scale**, of which
**hosting under US$150/mo**. The audit found the target written down and never
computed. This is the computation, per line, with the assumption beside it.

Every figure is list price in USD at 2026-07 for the smallest tier that meets the
stated load. Where a vendor is not yet contracted the line is marked ⏳ and priced
at its published rate — those become real numbers when the human gates close.

## Pre-scale (v1.0: one live market, ≤500 sellers, ≤50k conversations/mo)

| Line | Choice | Assumption | US$/mo |
|---|---|---|---|
| App host (primary) | Hetzner CCX23 (4 vCPU, 16GB) | one deployable — the modular monolith is the cost strategy | 32 |
| App host (spare + monitoring) | Hetzner CPX21 (3 vCPU, 4GB) | failover target + metrics scrape | 9 |
| Postgres | Hetzner managed, 4 vCPU / 8GB / 80GB | all state lives here; ledger is append-only so growth is linear | 48 |
| Redis | 1GB on the spare host | queues + idempotency keys only, no persistence needed | 0 |
| Object storage | Hetzner Storage Box 1TB | media refs, record packs, evidence bundles | 4 |
| Backups | daily PG snapshot + weekly offsite | 30-day retention | 6 |
| DNS + TLS | Cloudflare free + Let's Encrypt | static assets are tiny; no CDN tier needed at this size | 0 |
| **Hosting subtotal** | | **target <150** | **99** |
| LLM — routine replies | cheap tier, ~45k calls/mo @ ~700 tok | intent + reply on the cheap route (P4 router) | 95 |
| LLM — money/compliance | strong tier, ~3k calls/mo | money-math and compliance only, per the routing table | 60 |
| ASR (voice notes) | ~6k notes/mo @ 25s avg | voice is first-class; this is the real Caribbean usage shape | 45 |
| Image polish | ~1.5k images/mo | Studio polishes REAL photos; never generates product imagery | 30 |
| Messaging ⏳ | WhatsApp Business API, ~25k conversations/mo | service+utility mix at published Jamaica rates | 175 |
| SMS fallback ⏳ | ~4k segments/mo | the P34/P35 lane — blackout + eviction insurance | 40 |
| Error tracking + uptime | self-hosted on the spare host | `/metrics` + the error budget are already ours | 0 |
| Domains + email | 2 domains + workspace seat | | 15 |
| **Total** | | **target <700** | **559** |

**Headroom: US$141/mo (20%).** The two ⏳ lines are 38% of the total and are the
ones that move when the human gates close, so the headroom is deliberately kept
for them rather than spent.

## What the Bursar watches

`core/src/agents/bursar.ts` re-prices these monthly and proposes swaps. The rule
that overrides every saving: a cheaper vendor on a lane that touches PII must have
a signed DPA, or the swap is blocked before it ever reaches the founder queue
(`recordSwapReview` puts the block on the audit record). Cheapest applies to
compute, never to trust.

Adapters are why this table is changeable at all — every line above is behind a
port, so a swap is config, not a rewrite.

## What breaks the estimate

| Trigger | Effect | Where it is handled |
|---|---|---|
| A second live market | +~US$120/mo (messaging + LLM scale linearly; hosting does not) | Four Packs rule — no new infra shape |
| >25k MAU | multi-region + read replica | Phase-7 checklist, BUILD_STATUS.md |
| Ad spend live (P26) | pass-through, custodied by the partner | never Sycamore's float (Constitution §6) |
| Voice-note volume 3× | ASR is the first line to reprice | Bursar's monthly report |

## Honest caveats

- The two ⏳ lines are published rates, not contracted rates. They are the least
  certain numbers here and the most likely to move.
- LLM token estimates come from the fixture traffic in the golden-path and
  injection suites, scaled to the sellers/conversations assumption above. They are
  a projection from synthetic traffic, not a measurement of production.
- Hosting is priced for the modular monolith. Extraction to services — which the
  stack explicitly defers until a module proves a bottleneck — would roughly
  double the hosting line before it improved anything.
