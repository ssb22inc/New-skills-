import { deepFreeze } from "./freeze.ts";

/** CLASS 2 — Law 2. Changing any value in this file requires a human-approved
 * commit carrying an APPROVALS/ entry (enforced by scripts/class2-gate.mjs in CI).
 * No runtime path may raise a cap; there is deliberately no setter API and no
 * default cap — an unknown client has NO cap and therefore may spend NOTHING. */

export interface ClientCaps {
  /** Max ad spend per client-local day, USD.
   * NOT YET ENFORCED ANYWHERE: no write path exists before Phase 6. The only
   * cap consulted today is `dailyAiSpendUsd`. A later phase must not assume a
   * guard already exists here (adversary spec observation #6). */
  readonly dailyAdSpendUsd: number;
  /** Max cumulative ad spend for the engagement, USD. Not yet enforced — see
   * `dailyAdSpendUsd`; the Phase 6 write adapter owns both. */
  readonly totalAdSpendUsd: number;
  /** Max AI (LLM/render) spend per client-local day, USD. Enforced locally in
   * llm() pre-call (R3) — never delegated to Gateway config. */
  readonly dailyAiSpendUsd: number;
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
  // Client zero (ENGINE_BUILD.md §14): $2,000 sprint at ~$66/day. Values are
  // conservative placeholders PENDING H8 SIGN-OFF — unusable until signed.
  pulsern: {
    dailyAdSpendUsd: 70,
    totalAdSpendUsd: 2000,
    dailyAiSpendUsd: 25,
    humanSignoff: null,
  },
  "fixture-testco": {
    dailyAdSpendUsd: 1,
    totalAdSpendUsd: 1,
    dailyAiSpendUsd: 5,
    humanSignoff: FIXTURE_SIGNOFF,
  },
});

export class CapError extends Error {}

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
    dailyAdSpendUsd: raw.dailyAdSpendUsd,
    totalAdSpendUsd: raw.totalAdSpendUsd,
    dailyAiSpendUsd: raw.dailyAiSpendUsd,
    humanSignoff: raw.humanSignoff,
  };
  assertSaneCap(snapshot.dailyAdSpendUsd, "dailyAdSpendUsd");
  assertSaneCap(snapshot.totalAdSpendUsd, "totalAdSpendUsd");
  assertSaneCap(snapshot.dailyAiSpendUsd, "dailyAiSpendUsd");
  return Object.freeze(snapshot);
}

/** Refuses caps that lack human sign-off (H8). Called on every spend path.
 * The marker is always the one in this file — see `effectiveDailyAiCapUsd`. */
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

/** The enforced AI cap for a client, in USD.
 *
 * A caller may pass a narrowing table — a test driving a breach at $0.05
 * instead of the fixture's $5.00 — but it can only ever LOWER the ceiling
 * (adversary finding R2-03). It cannot raise a cap, cannot invent a client, and
 * cannot supply a sign-off: unknown clients still throw, and `assertCapsUsable`
 * runs against the frozen record, so an unsigned client refuses all spend no
 * matter what the caller hands in. */
export function effectiveDailyAiCapUsd(
  clientId: string,
  narrowing?: Readonly<Record<string, { readonly dailyAiSpendUsd?: number }>>,
): number {
  const caps = getCaps(clientId); // throws for unknown clients
  assertCapsUsable(caps, clientId); // sign-off comes from the frozen table, always
  const ceiling = caps.dailyAiSpendUsd;
  if (narrowing === undefined || narrowing === null) return ceiling;
  const entry = Object.hasOwn(narrowing, clientId) ? narrowing[clientId] : undefined;
  const requested = entry?.dailyAiSpendUsd;
  if (requested === undefined) return ceiling;
  assertSaneCap(requested, "narrowed dailyAiSpendUsd");
  return Math.min(ceiling, requested);
}

export { CAPS_TABLE };
