# Chaos calendar (BUILD §5.6) — monthly, scripted, in staging

Every drill is a runnable script. In CI they run on every push; the
calendar below is the *operational* cadence against staging, and the
quarterly game-day runs them against prod (P32 HUMAN GATE covers the
first timed prod rehearsal).

| Week of month | Drill | Command | Pass condition |
|---|---|---|---|
| 1 | Payment partner down 30 min | `pnpm --filter @sycamore/tests chaos:partner-down` | checkout reroutes, zero lost orders |
| 2 | WhatsApp degraded | `pnpm --filter @sycamore/tests chaos:whatsapp` | SMS/PWA fallback carries every confirmation |
| 3 | PG failover mid-storm | `pnpm --filter @sycamore/tests chaos:pg-failover` | §5.2 capacity invariants hold |
| 4 | Hurricane Mode rehearsal | `pnpm --filter @sycamore/core test -- src/hurricane` | runbook score: every step within target |

Quarterly (game-day, prod): all four back-to-back + §5.7 fraud red-team
+ P29 agent-safety drill (`core/src/agents/builder.integration.test.ts`).

The full-size kill-storm (500 attempts / 12 seats, connections killed
mid-flight) is permanent CI: `core/src/capacity/oversell.storm.integration.test.ts`.
