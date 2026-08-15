import { deepFreeze } from "./freeze.ts";

/** The Switchboard, market half (ENGINE_BUILD.md §2.5, Law 18). Every entry is
 * a flag with an earned unlock. Flag changes are code commits — there is no
 * runtime mutation API, and resolveActive* throws for anything not "on"
 * (locked flags structurally inert, §10.2). Bundle fields exist now as typed
 * slots (adversary finding R13) so later phases fill them, not reshape them. */

export type FlagStatus = "on" | "staged" | "locked";

export interface MarketEntry {
  readonly status: FlagStatus;
  /** Jurisdiction pack ref (advertising/claims law) — no pack, no ads. */
  readonly jurisdictionPack: string | null;
  readonly paymentAdapters: readonly string[];
  /** Language packs with per-language role evals (§2.5). */
  readonly languagePacks: readonly string[];
  /** IANA zone the client clock runs on. */
  readonly localeClock: string | null;
  readonly dataResidency: string | null;
}

export const MARKETS: Readonly<Record<string, MarketEntry>> = deepFreeze({
  US: {
    status: "on",
    jurisdictionPack: "packs/us-ftc",
    paymentAdapters: ["stripe", "shopify"],
    languagePacks: ["en-US"],
    localeClock: null, // per-client at onboarding
    dataResidency: "us",
  },
  EU: { status: "locked", jurisdictionPack: null, paymentAdapters: [], languagePacks: [], localeClock: null, dataResidency: null },
  IN: { status: "locked", jurisdictionPack: null, paymentAdapters: [], languagePacks: [], localeClock: null, dataResidency: null },
});

export class SwitchboardError extends Error {}

export function activeMarkets(): string[] {
  return Object.entries(MARKETS).filter(([, m]) => m.status === "on").map(([k]) => k);
}

/** The only way to obtain a market for use. Staged and locked both refuse. */
export function requireActiveMarket(code: string): MarketEntry {
  // Own-property guard: inherited/polluted prototype entries are not markets.
  const m = Object.hasOwn(MARKETS, code) ? MARKETS[code] : undefined;
  if (m === undefined) throw new SwitchboardError(`unknown market "${code}"`);
  if (m.status !== "on") {
    throw new SwitchboardError(`market "${code}" is ${m.status} — activation requires its bundle to pass adversary on live data (Law 18)`);
  }
  return m;
}
