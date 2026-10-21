import { deepFreeze } from "./freeze.ts";

/** The Switchboard, market half (ENGINE_BUILD.md §2.5, Law 18). Every entry is
 * a flag with an earned unlock. Flag changes are code commits — there is no
 * runtime mutation API, and resolveActive* throws for anything not "on"
 * (locked flags structurally inert, §10.2). Bundle fields exist now as typed
 * slots (adversary finding R13) so later phases fill them, not reshape them. */

export type FlagStatus = "on" | "staged" | "locked";

/** WHY A FLAG IS ON (cross-family findings x8 X-03, x10 X-04, GPT-6 Luna,
 * 2026-10-10). `status: "on"` alone activated an entry; x8's fix added a
 * "bundle" basis naming an adversary report, and x10 showed that a named
 * report is an assertion, not evidence — nothing at runtime can prove it is a
 * live-data PASS for that bundle. Phase 0 has no live-data bundle pipeline at
 * all, so the bundle basis is GONE: the only basis is the LAUNCH set fixed by
 * ENGINE_BUILD.md §2.5 (US, Meta). The capability removed: turning on any
 * market or channel outside the launch set, by any registry edit. The
 * activation route for a later flag is that later phase's deliverable, and it
 * arrives with its own evidence chain rather than a filename. */
export type Activation = { readonly basis: "launch" };

/** ENGINE_BUILD.md §2.5's launch: these, and only these, can be on. */
export const LAUNCH_ACTIVE: Readonly<{ markets: readonly string[]; channels: readonly string[] }> = Object.freeze({
  markets: Object.freeze(["US"]),
  channels: Object.freeze(["meta"]),
});

/** An "on" entry must be in the launch set, say so, and carry a complete bundle. */
export function assertActivationEarned(kind: "market" | "channel", code: string, activation: Activation | null | undefined, missing: readonly string[]): void {
  if (missing.length > 0) {
    throw new SwitchboardError(`${kind} "${code}" is on with an incomplete bundle (${missing.join(", ")}) — no bundle, no activation (Law 18)`);
  }
  const launch = kind === "market" ? LAUNCH_ACTIVE.markets : LAUNCH_ACTIVE.channels;
  if (activation?.basis === "launch" && launch.includes(code)) return;
  throw new SwitchboardError(`${kind} "${code}" is on outside the launch set — no activation route exists before its bundle phase (Law 18, x10 X-04)`);
}

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
  /** Required when status is "on" (x8 X-03). */
  readonly activation?: Activation;
}

export const MARKETS: Readonly<Record<string, MarketEntry>> = deepFreeze({
  US: {
    status: "on",
    jurisdictionPack: "packs/us-ftc",
    paymentAdapters: ["stripe", "shopify"],
    languagePacks: ["en-US"],
    localeClock: null, // per-client at onboarding
    dataResidency: "us",
    activation: { basis: "launch" },
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
  return resolveActiveMarket(MARKETS, code);
}

/** The resolution rule over a given table — not exported (x9 X-03). */
function resolveActiveMarket(table: Readonly<Record<string, MarketEntry>>, code: string): MarketEntry {
  // Own-property guard: inherited/polluted prototype entries are not markets.
  const m = Object.hasOwn(table, code) ? table[code] : undefined;
  if (m === undefined) throw new SwitchboardError(`unknown market "${code}"`);
  if (m.status !== "on") {
    throw new SwitchboardError(`market "${code}" is ${m.status} — activation requires its bundle to pass adversary on live data (Law 18)`);
  }
  assertActivationEarned("market", code, m.activation, marketBundleGaps(m));
  return m;
}

/** The §2.5 market bundle slots an active market must fill. The locale clock
 * is per-client (set at onboarding), so it is not one of them. */
export function marketBundleGaps(m: MarketEntry): string[] {
  const gaps: string[] = [];
  if (!m.jurisdictionPack) gaps.push("jurisdictionPack");
  if (m.paymentAdapters.length === 0) gaps.push("paymentAdapters");
  if (m.languagePacks.length === 0) gaps.push("languagePacks");
  if (!m.dataResidency) gaps.push("dataResidency");
  return gaps;
}

/** The resolution rule, for the suite only: refuses outside the test runner
 * (the spend ledger's fence), so no deployed caller can resolve a table it
 * built (x9 X-03). */
export function resolveActiveMarketForTests(table: Readonly<Record<string, MarketEntry>>, code: string): MarketEntry {
  const marker = (globalThis as Record<string, unknown>)["__vitest_worker__"];
  if (marker === undefined || marker === null) {
    throw new SwitchboardError("resolveActiveMarketForTests ran outside a test runner — only the frozen registry resolves (x9 X-03)");
  }
  return resolveActiveMarket(table, code);
}
