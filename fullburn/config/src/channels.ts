import { deepFreeze } from "./freeze.ts";
import { SwitchboardError, type FlagStatus } from "./markets.ts";

/** The Switchboard, channel half (§2.5, §6.1). Launch: Meta on, Google staged
 * (adapter built in Phase 5, live on first baseline beat), all else locked. */

export interface ChannelEntry {
  readonly status: FlagStatus;
  /** Contract-tested write adapter ref — publish/pause/promote only (Law 1). */
  readonly writeAdapter: string | null;
  readonly decisionAdversaryRules: string | null;
  readonly fatigueModel: string | null;
}

export const CHANNELS: Readonly<Record<string, ChannelEntry>> = deepFreeze({
  meta: {
    status: "on",
    writeAdapter: "adapters/meta-marketing-api", // Phase 6 deliverable; ref only
    decisionAdversaryRules: "rules/meta-decision",
    fatigueModel: "fatigue/meta",
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
  // Own-property guard: inherited/polluted prototype entries are not channels.
  const c = Object.hasOwn(CHANNELS, code) ? CHANNELS[code] : undefined;
  if (c === undefined) throw new SwitchboardError(`unknown channel "${code}"`);
  if (c.status !== "on") {
    throw new SwitchboardError(`channel "${code}" is ${c.status} — activation requires its bundle to pass adversary on live data (Law 18)`);
  }
  return c;
}
