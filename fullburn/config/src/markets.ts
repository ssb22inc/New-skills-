import { deepFreeze } from "./freeze.ts";

/** The Switchboard, market half (ENGINE_BUILD.md §2.5, Law 18). Every entry is
 * a flag with an earned unlock. Flag changes are code commits — there is no
 * runtime mutation API, and resolveActive* throws for anything not "on"
 * (locked flags structurally inert, §10.2). Bundle fields exist now as typed
 * slots (adversary finding R13) so later phases fill them, not reshape them. */

export type FlagStatus = "on" | "staged" | "locked";

/** WHY A FLAG IS ON (cross-family finding x8 X-03, GPT-6 Luna, 2026-10-10).
 * `status: "on"` alone activated an entry, so a one-word registry edit turned
 * on a locked channel, or a market with no jurisdiction pack. An "on" entry
 * now carries its basis: the LAUNCH set fixed by ENGINE_BUILD.md §2.5 (US,
 * Meta), or a BUNDLE that passed the adversary on live data, named by its
 * committed report. */
export type Activation =
  | { readonly basis: "launch" }
  | { readonly basis: "bundle"; readonly adversaryReport: string; readonly liveData: true };

/** ENGINE_BUILD.md §2.5's launch: these, and only these, are on without a bundle report. */
export const LAUNCH_ACTIVE: Readonly<{ markets: readonly string[]; channels: readonly string[] }> = Object.freeze({
  markets: Object.freeze(["US"]),
  channels: Object.freeze(["meta"]),
});

/** An "on" entry must say why, and its bundle must be complete. The
 * capability removed: activating a flag by editing its status alone.
 * NARROWING, stated: that the named report exists and is a live-data PASS is
 * checked by the suite against reports/ (config/test/switchboard.test.ts), not
 * at runtime — a Worker cannot read the repository. */
export function assertActivationEarned(kind: "market" | "channel", code: string, activation: Activation | null | undefined, missing: readonly string[]): void {
  if (missing.length > 0) {
    throw new SwitchboardError(`${kind} "${code}" is on with an incomplete bundle (${missing.join(", ")}) — no bundle, no activation (Law 18)`);
  }
  const launch = kind === "market" ? LAUNCH_ACTIVE.markets : LAUNCH_ACTIVE.channels;
  if (activation?.basis === "launch" && launch.includes(code)) return;
  if (
    activation?.basis === "bundle" &&
    activation.liveData === true &&
    typeof activation.adversaryReport === "string" &&
    /^ADVERSARY_REPORT_[\w.-]+\.md$/.test(activation.adversaryReport)
  ) {
    return;
  }
  throw new SwitchboardError(`${kind} "${code}" is on without an earned activation — not in the launch set and no live-data adversary PASS named (Law 18)`);
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

/** @internal — the resolution rule over a given table (see resolveActiveChannel). */
export function resolveActiveMarket(table: Readonly<Record<string, MarketEntry>>, code: string): MarketEntry {
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
