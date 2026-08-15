import { deepFreeze } from "./freeze.ts";

/** CLASS 2 — Law 2. Changing any value in this file requires a human-approved
 * commit carrying an APPROVALS/ entry (enforced by scripts/class2-gate.mjs in CI).
 * No runtime path may raise a cap; there is deliberately no setter API and no
 * default cap — an unknown client has NO cap and therefore may spend NOTHING. */

export interface ClientCaps {
  /** Max ad spend per client-local day, USD. */
  readonly dailyAdSpendUsd: number;
  /** Max cumulative ad spend for the engagement, USD. */
  readonly totalAdSpendUsd: number;
  /** Max AI (LLM/render) spend per client-local day, USD. Enforced locally in
   * llm() pre-call (adversary finding R3) — never delegated to Gateway config. */
  readonly dailyAiSpendUsd: number;
  /** Human sign-off marker (H8). While null, caps are structurally UNUSABLE:
   * every spend path must refuse. Set only via a Class-2 approved commit. */
  readonly humanSignoff: string | null;
}

const CAPS_TABLE: Readonly<Record<string, ClientCaps>> = deepFreeze({
  // Client zero (ENGINE_BUILD.md §14): $2,000 sprint at ~$66/day. Values are
  // conservative placeholders PENDING H8 SIGN-OFF — unusable until signed.
  pulsern: {
    dailyAdSpendUsd: 70,
    totalAdSpendUsd: 2000,
    dailyAiSpendUsd: 25,
    humanSignoff: null,
  },
});

export class CapError extends Error {}

function assertSaneCap(n: unknown, label: string): asserts n is number {
  // Fail-closed guard (adversary finding R2): a malformed cap must throw here,
  // never flow into a `spend < undefined` comparison that is silently false.
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new CapError(`cap ${label} is not a finite positive number`);
  }
}

/** Strict lookup: unknown client → throw. Never returns a default. */
export function getCaps(
  clientId: string,
  table: Readonly<Record<string, ClientCaps>> = CAPS_TABLE,
): ClientCaps {
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new CapError("clientId required for cap lookup");
  }
  // Own-property guard (prototype pollution must not mint caps).
  const caps = Object.hasOwn(table, clientId) ? table[clientId] : undefined;
  if (caps === undefined) {
    throw new CapError(`no caps configured for client "${clientId}" — spend is forbidden`);
  }
  assertSaneCap(caps.dailyAdSpendUsd, "dailyAdSpendUsd");
  assertSaneCap(caps.totalAdSpendUsd, "totalAdSpendUsd");
  assertSaneCap(caps.dailyAiSpendUsd, "dailyAiSpendUsd");
  return caps;
}

/** Refuses caps that lack human sign-off (H8). Called on every spend path. */
export function assertCapsUsable(caps: ClientCaps): void {
  if (caps.humanSignoff === null) {
    throw new CapError("caps lack human sign-off (H8) — all spend paths refuse");
  }
}

export { CAPS_TABLE };
