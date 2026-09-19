# DEMO.md — see Sycamore working, with zero human gates

The two outstanding human gates (payment-partner credentials, ad-account
credentials) gate **going live**, not **seeing it work**. Every external thing in
Sycamore sits behind an adapter port, and the mock adapters are real
implementations of those ports — so the whole product runs locally, today, with
nothing signed.

## Four commands

```bash
docker compose up -d                 # Postgres + Redis
pnpm demo                            # seeds a Jamaican market, prints your URLs
pnpm --filter @sycamore/web build
pnpm --filter @sycamore/web start    # http://localhost:3000
```

`pnpm demo` prints the exact links, because seller ids are generated. It is safe
to re-run — it rebuilds the market from scratch each time.

> If the web server can't find pack files, set `SYCAMORE_PACKS_DIR=$PWD/packs`
> before `start`. Next's bundler relocates the module that resolves them; the env
> override is the supported escape hatch.

## What the demo seeds

Three sellers in Jamaica, chosen so every mechanism has something to show:

| Seller | Why they're there |
|---|---|
| **Sea Breeze Boat Tours** (Miss Pat) | 47 completed orders — verified, and the one with the client installed |
| **Mama J's Kitchen** (Delroy) | mid-sized, a different vertical, open orders waiting on the seller's day |
| **Blue Hole Adventures** (Shanice) | 2 completed orders — still a newcomer, so the exposure floor applies |

Plus 14 buyers, real bookings against real capacity windows, money captured and
released through the double-entry ledger, three seller payouts, verified reviews
from completed bookings only, and the agent crew's audit record.

## What to look at, and what it proves

| Open | What you're actually seeing |
|---|---|
| `/cockpit?market=jm` | Money in plain numbers, the fairness meter, the install rate, all eight agents' report cards, complaints, incidents, the Scout radar. Every number is a row in a table or the outbox — nothing is computed for display. |
| `/t/jm/<seller>` | The buyer trust page. Live availability from the capacity engine, licence slots from the vertical pack, the verified badge. **2,978 bytes, interactive in 484 ms on throttled 3G.** |
| `/t/jm/<newcomer>` | The same page for a seller with no record yet — 🌱 Early days instead of ✓ Verified. Nothing is hidden or faked to make them look established. |
| `/why/jm/<seller>` | Constitution §4, show-me-why. One tap from the trust page, and the buyer sees the exact components the ranker used — including, plainly, when the placement is a newcomer audition rather than earned rank. |
| `/c/jm/<seller>` | The sovereign door: the seller's own chat surface. This is what P35 exists for — if the WhatsApp door ever closes, this one was already open. |
| `/s/jm/<seller>?offer=1` | The seller's day, with the earned install offer. Open orders, the next seven days, contacts, catalog. |
| `/t/do/<seller>` | **404.** Region lockdown: the Dominican Republic pack is dark, so its routes do not exist. |

## Chat, without WhatsApp

```bash
pnpm demo:chat "book 2 seats for saturday"
pnpm demo:chat                 # interactive
```

WhatsApp is one `ChannelAdapter` among several. This drives the identical path
through the `mock` door and prints what the engine decided:

```
  you → the captain was rude to my mother
  ├─ door        mock (signature ok)
  ├─ intent      complaint
  └─ engine      escalate_to_owner
     ↳ complaint: ZERO bot reply. The owner gets it, with context.
```

Worth trying: `STOP` (Autopilot silences), then anything (silence), then `RESUME`.

## Watching the laws hold, not just the pages render

These are the gates, runnable now:

```bash
pnpm test                                        # 250 tests
pnpm --filter @sycamore/core exec vitest run src/capacity/oversell.storm
                                                 # 500 concurrent → exactly 12
pnpm --filter @sycamore/core exec vitest run src/ledger
                                                 # 10,000 fuzzed ops → drift 0
pnpm --filter @sycamore/tests exec vitest run src/lifeline
                                                 # 48h blackout, queue replays once
pnpm --filter @sycamore/tests exec vitest run src/sovereignty
                                                 # WhatsApp deleted, doors still work
pnpm --filter @sycamore/tests perf:trust         # the trust-page budget
pnpm --filter @sycamore/tests load:profiles      # all four load shapes
pnpm rollback --list                             # the 2am operator script
```

## What is real here, and what is standing in

**Real:** the capacity engine and its transactional holds, the double-entry
ledger, splits and payouts, the ranking maths, the fairness meter, the region
lockdown (a Postgres trigger, not a convention), review verification and fraud
signals, the agent crew, every page, the localization engine, the design tokens.

**Standing in:** the payment partner (mock adapter — money moves on the ledger,
not through a bank), the ad platforms (mock), the messaging carrier (mock
channel), and the LLM (scripted keyword classifier in `demo:chat`, so the demo is
deterministic and free).

That list is exactly the human-gate list. Nothing else is pretend.

## The one thing you cannot see this way

Installing the PWA to a home screen needs a real phone — a container cannot tap
"Add to home screen". Everything up to that moment is visible: the manifest, the
icons, the service worker, the earned offer, the two-offer cap. Open
`/s/jm/<seller>?offer=1` in Chrome on an Android phone pointed at your machine
and the install banner is real.
