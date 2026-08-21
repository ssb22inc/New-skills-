import { deepFreeze } from "./freeze.ts";

/** CLASS 2 — Law 2. Changing any value in this file requires a human-approved
 * commit carrying an APPROVALS/ entry (enforced by scripts/class2-gate.mjs in CI).
 * No runtime path may raise a cap; there is deliberately no setter API and no
 * default cap — an unknown client has NO cap and therefore may spend NOTHING. */

export interface ClientCaps {
  /** PACING TARGET for ad spend per client-local day, USD. The rate the engine
   * aims at, not the line it refuses at — see `hardDailyAdSpendUsd`.
   * NOT YET ENFORCED ANYWHERE: no write path exists before Phase 6. The only
   * caps consulted today are the AI pair. A later phase must not assume a
   * guard already exists here (adversary spec observation #6). */
  readonly dailyAdSpendUsd: number;
  /** ABSOLUTE daily refusal line for ad spend, USD. A day may run over the
   * pacing target; it may never cross this. Separate from `dailyAdSpendUsd`
   * because a target and a ceiling are different decisions and collapsing them
   * means either the pacing is a hard stop (the engine cannot catch up) or the
   * ceiling is advisory (there is no stop at all).
   * NOT YET ENFORCED — Phase 6's write adapter must honour it. */
  readonly hardDailyAdSpendUsd: number;
  /** Max cumulative ad spend for the engagement, USD. Not yet enforced — see
   * `dailyAdSpendUsd`; the Phase 6 write adapter owns all three. */
  readonly totalAdSpendUsd: number;
  /** Max AI (LLM/render) spend per client-local day, USD. Enforced locally in
   * llm() pre-call (R3) — never delegated to Gateway config.
   *
   * This is a SUB-LIMIT of `monthlyAiSpendUsd`, not a division of it. Its job
   * is to stop a runaway loop consuming the whole month in an hour; the month
   * is what bounds total exposure. Both are enforced and whichever binds first
   * wins. */
  readonly dailyAiSpendUsd: number;
  /** Max AI spend per client-local MONTH, USD — the real exposure ceiling.
   * Enforced alongside the daily sub-limit on every call. */
  readonly monthlyAiSpendUsd: number;
  /** The client's canonical business timezone, as an IANA zone name.
   *
   * THIS IS THE ACCOUNTING ZONE, NOT A DISPLAY ZONE. How a UI, a user account
   * setting, a device, or a database renders a timestamp is irrelevant to it:
   * the daily cap buckets here and nowhere else. Conflating the two is how a
   * cap silently means something other than what was approved.
   *
   * An IANA name rather than a fixed offset, deliberately — `UTC-5` is wrong
   * for half the year in most of the zones we will ever use, and a cap that is
   * wrong for half the year is a cap nobody can reason about.
   *
   * The ledger keyed on UTC while this interface promised a client-local day:
   * $10 at 23:59Z and $10 at 00:01Z were two ledger days and ONE New York day,
   * so $20 landed under a $10/day cap (adversary finding R7-02, cross-family).
   * Ledger L14 had disclosed the mismatch for three rounds. A disclosed wrong
   * cap is still a wrong cap. */
  readonly ianaTimeZone: string;
  /** Human sign-off marker (H8). While null, caps are structurally UNUSABLE:
   * every spend path must refuse. Set only via a Class-2 approved commit, and
   * read ONLY from this frozen table — never from a caller-supplied record
   * (adversary finding R2-03: an agent must not be able to sign its own caps). */
  readonly humanSignoff: string | null;
}

/** Fixture clients exist so the test suite can drive the real money path
 * without a runtime injection seam (adversary finding R2-03). They are entries
 * in the real table, deliberately: their ids are not client identifiers, their
 * caps are trivial, and their sign-off marker says what they are. */
const FIXTURE_SIGNOFF = "TEST FIXTURE — not a real client";
/** A fixture marker is only a valid sign-off for an id under this prefix
 * (adversary finding M-06). H8's guarantee is that caps are unusable until a
 * HUMAN signs them, and `assertCapsUsable` accepted any non-empty string — so
 * the builder-written fixture constant was, in form, a self-signature that
 * would work for any client. Now a fixture signature only signs a fixture. */
export const FIXTURE_CLIENT_PREFIX = "fixture-";

const CAPS_TABLE: Readonly<Record<string, ClientCaps>> = deepFreeze({
  // Client zero (ENGINE_BUILD.md §14): the $2,000 / 30-day concentrated sprint.
  // H8 SIGNED 2026-08-16 — see APPROVALS/2026-08-16-h8-caps.md for the
  // transition this file's values were approved in.
  pulsern: {
    // Eastern Time, declared by the human on 2026-08-16. IANA rather than an
    // offset so the EST/EDT transition is handled by the zone, not by us.
    ianaTimeZone: "America/New_York",
    dailyAdSpendUsd: 66,
    hardDailyAdSpendUsd: 75,
    totalAdSpendUsd: 2000,
    dailyAiSpendUsd: 10,
    monthlyAiSpendUsd: 200,
    humanSignoff: "H8 approved 2026-08-16 — $66/day pacing, $75/day hard, $2,000 total, AI $200/mo with a $10/day sub-limit",
  },
  // Exists so the "caps lack human sign-off refuses all spend" path (H8) has a
  // client to prove itself against. Client zero used to serve that purpose by
  // being unsigned; once it was signed the test would have quietly started
  // passing for a different reason, or been deleted (adversary finding H8).
  "fixture-unsigned": {
    ianaTimeZone: "UTC",
    dailyAdSpendUsd: 1,
    hardDailyAdSpendUsd: 1,
    totalAdSpendUsd: 1,
    dailyAiSpendUsd: 1,
    monthlyAiSpendUsd: 1,
    humanSignoff: null,
  },
  "fixture-testco": {
    ianaTimeZone: "UTC",
    dailyAdSpendUsd: 1,
    hardDailyAdSpendUsd: 1,
    totalAdSpendUsd: 1,
    dailyAiSpendUsd: 5,
    monthlyAiSpendUsd: 20,
    humanSignoff: FIXTURE_SIGNOFF,
  },
});

/** REGISTRY-STABLE, for the reason `engine/src/money-errors.ts` sets out:
 * `gateway.ts` classifies refusals with `instanceof CapError`, and a second
 * module instance of this file would make that false for the same conceptual
 * error — a money-path misclassification, not only a test artifact (adversary
 * finding R14-05). */
const CAP_ERROR_SLOT = Symbol.for("fullburn.money-errors.CapError");
const CAP_ERROR_REGISTRY = globalThis as unknown as Record<symbol, (new (message?: string) => Error) | undefined>;
CAP_ERROR_REGISTRY[CAP_ERROR_SLOT] ??= class CapError extends Error {};
export const CapError = CAP_ERROR_REGISTRY[CAP_ERROR_SLOT]!;
export type CapError = InstanceType<typeof CapError>;

function assertSaneCap(n: unknown, label: string): asserts n is number {
  // Fail-closed guard (R2): a malformed cap must throw here, never flow into a
  // `spend < undefined` comparison that is silently false.
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new CapError(`cap ${label} is not a finite positive number`);
  }
}

/** Strict lookup against the frozen table. Unknown client → throw. Never
 * returns a default, and there is no parameter by which a caller can supply a
 * different table (R2-03). Values are read ONCE into primitives so a getter
 * cannot return one number to the validator and another to the enforcer. */
export function getCaps(clientId: string): ClientCaps {
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new CapError("clientId required for cap lookup");
  }
  // Own-property guard (prototype pollution must not mint caps).
  const raw = Object.hasOwn(CAPS_TABLE, clientId) ? CAPS_TABLE[clientId] : undefined;
  if (raw === undefined) {
    throw new CapError(`no caps configured for client "${clientId}" — spend is forbidden`);
  }
  const snapshot: ClientCaps = {
    ianaTimeZone: raw.ianaTimeZone,
    dailyAdSpendUsd: raw.dailyAdSpendUsd,
    hardDailyAdSpendUsd: raw.hardDailyAdSpendUsd,
    totalAdSpendUsd: raw.totalAdSpendUsd,
    dailyAiSpendUsd: raw.dailyAiSpendUsd,
    monthlyAiSpendUsd: raw.monthlyAiSpendUsd,
    humanSignoff: raw.humanSignoff,
  };
  assertSaneCap(snapshot.dailyAdSpendUsd, "dailyAdSpendUsd");
  assertSaneCap(snapshot.hardDailyAdSpendUsd, "hardDailyAdSpendUsd");
  assertSaneCap(snapshot.totalAdSpendUsd, "totalAdSpendUsd");
  assertSaneCap(snapshot.dailyAiSpendUsd, "dailyAiSpendUsd");
  assertSaneCap(snapshot.monthlyAiSpendUsd, "monthlyAiSpendUsd");
  assertUsableZone(snapshot.ianaTimeZone, clientId);
  assertCapsCoherent(snapshot, clientId);
  return Object.freeze(snapshot);
}

/** A cap table can be individually sane and collectively nonsense. A hard
 * ceiling below its own pacing target means the pacing is never reached; a
 * daily sub-limit above its own month means the sub-limit never bites. Both are
 * typos that enforce the wrong number in the direction nobody looks, because
 * nothing errors and nothing overspends — the engine just quietly obeys a
 * figure the human did not approve.
 *
 * Exported so the relationships can be driven directly: `getCaps` deliberately
 * accepts no caller-supplied table (R2-03), so this is the only way to test the
 * checks against a bad one without reintroducing that seam. */
/** A zone name the runtime cannot resolve is not a zone. Validated on every
 * lookup rather than once at import, because a cap that cannot be bucketed must
 * refuse spend at the moment spend is attempted. */
export function assertUsableZone(zone: unknown, clientId: string): asserts zone is string {
  if (typeof zone !== "string" || zone.length === 0) {
    throw new CapError(`no accounting timezone configured for client "${clientId}" — spend is forbidden`);
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    throw new CapError(`"${zone}" is not a resolvable IANA timezone for client "${clientId}" — spend is forbidden`);
  }
}

export function assertCapsCoherent(caps: ClientCaps, clientId: string): void {
  if (caps.hardDailyAdSpendUsd < caps.dailyAdSpendUsd) {
    throw new CapError(`hardDailyAdSpendUsd is below the daily pacing target for "${clientId}"`);
  }
  if (caps.dailyAiSpendUsd > caps.monthlyAiSpendUsd) {
    throw new CapError(`dailyAiSpendUsd exceeds the monthly AI ceiling for "${clientId}"`);
  }
}

/** Refuses caps that lack human sign-off (H8). Called on every spend path.
 * The marker is always the one in this file — see `effectiveAiCapsUsd`. */
export function assertCapsUsable(caps: ClientCaps, clientId?: string): void {
  if (typeof caps.humanSignoff !== "string" || caps.humanSignoff.length === 0) {
    throw new CapError("caps lack human sign-off (H8) — all spend paths refuse");
  }
  if (caps.humanSignoff === FIXTURE_SIGNOFF && clientId !== undefined && !clientId.startsWith(FIXTURE_CLIENT_PREFIX)) {
    throw new CapError(
      `a test-fixture signature does not sign a real client — "${clientId}" needs a human sign-off (H8)`,
    );
  }
}

/** The enforced AI ceilings for a client, in USD: a daily sub-limit and the
 * monthly exposure cap. Both are returned and both are enforced — whichever
 * binds first wins.
 *
 * A caller may pass a NARROWING table — a test driving a breach at $0.05
 * instead of the fixture's $5.00 — but it can only ever LOWER a ceiling
 * (adversary finding R2-03). It cannot raise one, cannot invent a client, and
 * cannot supply a sign-off: unknown clients still throw, and `assertCapsUsable`
 * runs against the frozen record, so an unsigned client refuses all spend no
 * matter what the caller hands in. */
export interface AiCaps {
  readonly dailyUsd: number;
  readonly monthlyUsd: number;
  /** The zone the day and month buckets are computed in. Travels WITH the
   * ceilings so a caller cannot supply one without the other. */
  readonly timeZone: string;
}

export function effectiveAiCapsUsd(
  clientId: string,
  narrowing?: Readonly<Record<string, { readonly dailyAiSpendUsd?: number; readonly monthlyAiSpendUsd?: number }>>,
): AiCaps {
  const caps = getCaps(clientId); // throws for unknown clients
  assertCapsUsable(caps, clientId); // sign-off comes from the frozen table, always
  const entry =
    narrowing !== undefined && narrowing !== null && Object.hasOwn(narrowing, clientId) ? narrowing[clientId] : undefined;
  const narrow = (ceiling: number, requested: number | undefined, label: string): number => {
    if (requested === undefined) return ceiling;
    assertSaneCap(requested, label);
    return Math.min(ceiling, requested);
  };
  const monthlyUsd = narrow(caps.monthlyAiSpendUsd, entry?.monthlyAiSpendUsd, "narrowed monthlyAiSpendUsd");
  // A narrowed MONTH tightens the day with it. Narrowing the month to $1 while
  // the day stayed at $10 left a sub-limit that could never bite — the pair
  // became incoherent through a path that only ever tightens, which is exactly
  // the direction nobody inspects. The tighter of the two always wins.
  const dailyUsd = Math.min(narrow(caps.dailyAiSpendUsd, entry?.dailyAiSpendUsd, "narrowed dailyAiSpendUsd"), monthlyUsd);
  return Object.freeze({ dailyUsd, monthlyUsd, timeZone: caps.ianaTimeZone });
}

export { CAPS_TABLE };
