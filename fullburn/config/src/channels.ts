import { deepFreeze } from "./freeze.ts";
import { SwitchboardError, assertActivationEarned, type Activation, type FlagStatus } from "./markets.ts";

/** The Switchboard, channel half (§2.5, §6.1). Launch: Meta on, Google staged
 * (adapter built in Phase 5, live on first baseline beat), all else locked. */

export interface ChannelEntry {
  readonly status: FlagStatus;
  /** Contract-tested write adapter ref — publish/pause/promote only (Law 1). */
  readonly writeAdapter: string | null;
  readonly decisionAdversaryRules: string | null;
  readonly fatigueModel: string | null;
  /** Required when status is "on" (x8 X-03). */
  readonly activation?: Activation;
}

export const CHANNELS: Readonly<Record<string, ChannelEntry>> = deepFreeze({
  meta: {
    status: "on",
    writeAdapter: "adapters/meta-marketing-api", // Phase 6 deliverable; ref only
    decisionAdversaryRules: "rules/meta-decision",
    fatigueModel: "fatigue/meta",
    activation: { basis: "launch" },
  },
  google: { status: "staged", writeAdapter: null, decisionAdversaryRules: null, fatigueModel: null },
  tiktok: { status: "locked", writeAdapter: null, decisionAdversaryRules: null, fatigueModel: null },
  pinterest: { status: "locked", writeAdapter: null, decisionAdversaryRules: null, fatigueModel: null },
});

export function activeChannels(): string[] {
  return Object.entries(CHANNELS).filter(([, c]) => c.status === "on").map(([k]) => k);
}

/** The only way to obtain a channel for use. Staged (Google) refuses exactly
 * like locked: staged means BUILT, never LIVE, until its unlock rule fires. */
export function requireActiveChannel(code: string): ChannelEntry {
  return resolveActiveChannel(CHANNELS, code);
}

/** The resolution rule over a given table. NOT EXPORTED (cross-family finding
 * x9 X-03): exported, it "activated" any caller-built table. */
function resolveActiveChannel(table: Readonly<Record<string, ChannelEntry>>, code: string): ChannelEntry {
  // Own-property guard: inherited/polluted prototype entries are not channels.
  const c = Object.hasOwn(table, code) ? table[code] : undefined;
  if (c === undefined) throw new SwitchboardError(`unknown channel "${code}"`);
  if (c.status !== "on") {
    throw new SwitchboardError(`channel "${code}" is ${c.status} — activation requires its bundle to pass adversary on live data (Law 18)`);
  }
  assertActivationEarned("channel", code, c.activation, channelBundleGaps(c));
  return c;
}

/** The §2.5 channel bundle an active channel must carry. */
export function channelBundleGaps(c: ChannelEntry): string[] {
  const gaps: string[] = [];
  if (!c.writeAdapter) gaps.push("writeAdapter");
  if (!c.decisionAdversaryRules) gaps.push("decisionAdversaryRules");
  if (!c.fatigueModel) gaps.push("fatigueModel");
  return gaps;
}

/** The resolution rule, for the suite only: refuses outside the test runner
 * (the spend ledger's fence), so no deployed caller can resolve a table it
 * built (x9 X-03). */
export function resolveActiveChannelForTests(table: Readonly<Record<string, ChannelEntry>>, code: string): ChannelEntry {
  const marker = (globalThis as Record<string, unknown>)["__vitest_worker__"];
  if (marker === undefined || marker === null) {
    throw new SwitchboardError("resolveActiveChannelForTests ran outside a test runner — only the frozen registry resolves (x9 X-03)");
  }
  return resolveActiveChannel(table, code);
}
