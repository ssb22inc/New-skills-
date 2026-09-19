# SYCAMORE_SURVIVABILITY.md — Addendum v1.0
### Three threats, three permanent fixes. No feature changes. No UX changes.

---

## PATCH A — AGENT LOOP PREVENTION (add to CLAUDE.md today)

Append to CLAUDE.md, under a new heading "AGENT SESSION LAWS":

1. NEVER create watch loops, polling timers, or re-arming checks of any kind.
   Monitoring is CI's job (GitHub Actions), never a live session's job.
2. After opening a PR, the task is COMPLETE. Do not wait for merge, review, or
   CI. Report the PR link and proceed to the next prompt or exit.
3. Any background process you start must terminate before the task ends.
   Before finishing any task, list and kill your own background jobs.
4. If a task seems to require "keep checking until X" — STOP and ask the
   founder instead. Long-running observation belongs in CI or the Keeper's
   Watchman (server-side), never in an interactive session burning credits.

Why: an interactive agent that polls is a money leak with no off switch.
The platform already has the right home for every "watch" — CI for code,
Watchman for production metrics.

---

## P34 — LIFELINE: OFFLINE & LOW-BANDWIDTH SURVIVAL
*(insert after P32 in the prompt chain; builds on Hurricane Mode)*

**Principle: same features, degraded transport.** The architecture is already
store-and-forward (everything is an async message with an idempotency key).
Lifeline extends that property to the last mile. Nothing about what the app
DOES changes — only how far a message can crawl to get there.

Implement, in order:

a. **SMS lane (full fallback channel).** The Channel Adapter interface gains a
   real SMS adapter (Twilio/local aggregator behind the adapter). The
   conversation engine already speaks in plain text — orders, confirmations,
   cancellations, payout notices, and STOP all work over SMS with zero new
   product logic. Voice notes degrade to "text me instead" prompts.
   Buyers/sellers never learn a new behavior: same number, same conversation.

b. **Low-bandwidth mode (automatic).** When delivery latency/failure to a user
   rises, Watchman flips their sessions to lite mode: text-only (no images/
   video), compressed trust pages (<30KB text variant), receipts batched.
   Flips back automatically. User sees nothing but "it still works."

c. **Offline-first PWA queue.** The PWA caches the seller's day (orders,
   contacts, capacity) and queues outbound actions locally. On reconnect, the
   queue syncs; idempotency keys make replays harmless. A seller in a blackout
   can still see today's orders and mark them complete; the ledger catches up
   when the island does.

d. **Blackout Mode (extends Hurricane Mode).** Trigger: sustained regional
   connectivity collapse. Behavior: all non-essential messaging paused
   (no marketing, no Mentor), essential flow moves to SMS, completion proofs
   accept delayed submission with a widened dispute window, escrow release
   timers pause (money never auto-moves on stale information), and when
   connectivity returns, a reconciliation sweep processes the backlog in
   order. Buyers holding paid orders get an SMS: "Storm mode — your money is
   safe and held until this settles."

e. **Server truth is off-island.** Production runs in stable regions (EU/US);
   a hurricane can darken users, never the ledger. Status page + "we're safe"
   broadcast templates are pre-written per Context Pack.

**✅ GATE (the blackout drill):** simulate 48h total data loss for one parish:
orders placed by SMS during the outage, PWA queue replays on reconnect, ledger
reconciles to the cent, zero duplicate side effects, dispute windows correctly
extended. Run this drill every hurricane season (June 1) as a company ritual.

**What we deliberately do NOT build:** offline payments (cash codes/vouchers
validated later). Fraud surface is enormous and it violates "hold the trust."
In a blackout, commerce continues on record-now-settle-later; money moves only
on verified state.

---

## P35 — CHANNEL SOVEREIGNTY: SURVIVING A WHATSAPP RULE CHANGE
*(insert after P34)*

**Principle: WhatsApp is the door, not the house.** Sycamore's identity is a
phone number (portable), its state lives in Sycamore's database (catalog,
capacity, ledger, reviews, conversations), and its conversation engine is
channel-blind. Meta can change the door's price or lock it; the house stands.

Implement, in order:

a. **Channel-blindness test (make it law).** A CI test runs the full golden-path
   suite through the mock channel with the WhatsApp adapter deleted from the
   build. If anything fails, a WhatsApp dependency has leaked into core — fix
   before ship. This test is permanent.

b. **The sovereign door: PWA chat.** The PWA gains a first-class chat surface —
   identical conversation engine, same patois, same thumbs-up approvals. It is
   always alive at {seller}.sycamore.app. Every WhatsApp conversation footer
   periodically includes the seller's own link, so the habit of the sovereign
   door pre-exists any crisis.

c. **Identity escrow.** Every user's channel-independent identity (phone, opt-in
   status, conversation state) is exportable/rebindable. Migration = rebind
   identities to a new channel adapter. Tested, not theoretical.

d. **Commercial hedges (Bursar's standing brief).**
   - Maintain a secondary BSP (WhatsApp reseller) contract-ready — direct API
     and reseller are interchangeable behind the adapter.
   - Per-conversation cost is a watched vital: a Meta pricing change trips an
     alarm and a pre-modeled response (batch receipts harder, shift receipts
     to SMS, move marketing to Status/owned channels).
   - Quality rating (Meta's eviction signal) is a Watchman vital with a hard
     floor: opt-in hygiene and complaint escalation already keep it high —
     the cheapest insurance is being a model citizen of the platform.

e. **The eviction fire drill (quarterly).** Scripted rehearsal: "WhatsApp is
   gone at 09:00." Sequence: SMS blast to all users with their PWA chat link →
   sessions rebound to PWA/SMS → golden paths green on the alternate doors →
   measure: % of daily flow recovered within 24h (target ≥70% by drill #3).
   RCS and per-market channels (from Context Packs) join the bench as they
   mature.

**✅ GATE:** channel-blindness CI test green; one full eviction drill executed
in staging with recovery metrics recorded.

**Strategic note (why this also protects growth):** none of this slows the
WhatsApp-first strategy — WhatsApp remains the best door in every launch
market and we build our habit loops there. Sovereignty isn't hedging by
half-using the channel; it's using it fully while owning everything that
matters: the identity, the state, the money, and a second door that's always
unlocked.
