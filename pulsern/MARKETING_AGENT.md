# Giving a marketing agent access to PulseRN

An outside agent must never be handed the owner login.

Owner access on this site is one all-or-nothing gate — membership in the
`reviewers` table — and the same credential that opens the funnel also opens
`/api/users`, which can read every student's email, phone number and SMS
consent, comp subscriptions, trigger password-reset emails, and **permanently
delete a paying customer's account**. It also cannot be revoked without locking
the owner out of their own dashboard.

`/api/marketing` is the narrow alternative: one secret, read-only, no personal
data, revocable in ten seconds without touching anything else.

---

## 1. Make a key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

43 characters. Anything under 32 is refused at the door.

## 2. Put it in Vercel

Vercel → the PulseRN project → **Settings → Environment Variables**

| Name | Value | Environments |
|---|---|---|
| `MARKETING_API_KEY` | the key from step 1 | Production (and Preview if the agent will use a preview URL) |

Redeploy — environment variables are read at boot, so the endpoint keeps
answering 503 until the next deployment picks it up.

## 3. Give the agent the key and the URL

```
GET https://www.pulsern.app/api/marketing?days=30
Authorization: Bearer <MARKETING_API_KEY>
```

`x-api-key: <key>` works too, for agent frameworks that only send that. `POST`
is accepted with `{"days": 30}` in the body, for frameworks that only send POST.

`days=0` means all time. Anything unparseable falls back to 30 rather than
erroring, because a broken window should still return a usable answer.

Check it before handing it over:

```bash
curl -s https://www.pulsern.app/api/marketing?days=30 \
  -H "Authorization: Bearer $MARKETING_API_KEY" | head -40
```

## 4. Rotating or revoking

Change `MARKETING_API_KEY` in Vercel and redeploy. The old key stops working
immediately and nothing else is affected. Do this if the agent is retired, if
the key was pasted anywhere it should not have been, or on a schedule.

---

## What the agent gets

| Section | What it answers |
|---|---|
| `funnel.steps` | Signup → free pass → first answer → activated → paid, as **distinct people**, with the rate against signups, the rate against the step above, and `lostHere` — where students are actually being lost. |
| `funnel.bySource` | Signups, activations and sales by **first-touch** source (UTM tags, click ids, or referring host). The table an ad decision turns on. |
| `funnel.revenue` | Purchases and cents. Owner comps and launch checks are excluded and counted separately as `excludedInternal`. |
| `funnel.unitEconomics` | Activated→paid rate, revenue per activated student, and break-even CAC — what you may pay for one activated student before the spend stops paying for itself. `null` until there is a purchase to base it on. |
| `catalogue` | Live approved questions, case studies and flashcards, with a per-category breakdown. Exam-form items are excluded: they belong to the locked readiness exams and are not part of the practice bank. |
| `pricing` | The live plans, straight from `src/pricing.js`. |
| `claims` | **Where the shipped copy and the live database disagree.** |
| `pages` | The public marketing URLs, to fetch and audit directly. |
| `guardrails` | The claims-hygiene rules from `CLAUDE.md`, delivered with the data because an outside agent cannot read the repo. |

### `claims` is the section to read first

Plan blurbs carry hard numbers. Content grows; the blurbs do not. Both
directions are reported, and they are not the same kind of fault:

- **overstated** — promising content that is not there. A claims-hygiene
  violation; fix it.
- **understated** — the quiet, expensive one. Nobody complains, and the product
  sells as a fraction of what it is.

## What it deliberately cannot do

- **No writes.** There is no write path in the file. Not a disabled one, not a
  guarded one — none. A compromised or confused agent cannot grant, email,
  change or delete anything through this door.
- **No personal data.** It never reads `profiles`, never reads `auth.users`,
  never returns a user id. Every figure is a count or a rate, and
  `tests/marketing-api.test.js` asserts that against a real assembled payload —
  built from rows that *do* contain user ids, so the test proves they are
  aggregated away rather than merely absent.
- **No student content.** Counts use `head: true`, so not one question stem
  crosses the boundary, even in memory.

## What is still worth knowing

- The key is a bearer token: anyone holding it can read PulseRN's commercial
  metrics. It is not catastrophic the way the owner login would be, but it is
  not public information either. Treat it like a password and rotate it.
- There is no rate limit. Serverless instances do not share memory, so an
  in-process limiter would be theatre. If the agent is ever noisy enough to
  matter, the honest fix is Vercel's own firewall rules on the route, not a
  counter in this file.
- The numbers come from the same reducer as the owner dashboard
  (`src/funnel-report.js`). If the agent and the dashboard ever disagree, that
  is a bug, not a difference of method.
