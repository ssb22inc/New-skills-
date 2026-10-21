import { describe, expect, it } from "vitest";
import { MARKETS, SwitchboardError, activeMarkets, assertActivationEarned, marketBundleGaps, requireActiveMarket, resolveActiveMarketForTests, type Activation } from "@fullburn/config/markets";
import { CHANNELS, activeChannels, channelBundleGaps, requireActiveChannel, resolveActiveChannelForTests } from "@fullburn/config/channels";

describe("switchboard (Law 18, §2.5, §10.2 'locked flags structurally inert', R13)", () => {
  it("launch config is exactly US + Meta on, Google staged, rest locked", () => {
    expect(activeMarkets()).toEqual(["US"]);
    expect(activeChannels()).toEqual(["meta"]);
    expect(CHANNELS["google"]?.status).toBe("staged");
  });

  it("ATTACK direct mutation: flipping a locked flag throws and changes nothing", () => {
    expect(() => {
      (CHANNELS["tiktok"] as { status: string }).status = "on";
    }).toThrow(TypeError);
    expect(() => requireActiveChannel("tiktok")).toThrow(SwitchboardError);
  });

  it("ATTACK clone-and-patch: a patched copy cannot influence resolution", () => {
    const forged = { ...CHANNELS["google"], status: "on" as const };
    expect(forged.status).toBe("on"); // attacker holds a forged object...
    // ...but resolution reads only the frozen registry:
    expect(() => requireActiveChannel("google")).toThrow(/staged/);
  });

  it("ATTACK prototype pollution: cannot inject an active market", () => {
    (Object.prototype as Record<string, unknown>)["EVIL"] = { status: "on" };
    try {
      expect(() => requireActiveMarket("EVIL")).toThrow(SwitchboardError);
      expect(activeMarkets()).toEqual(["US"]);
    } finally {
      delete (Object.prototype as Record<string, unknown>)["EVIL"];
    }
  });

  it("staged (built, not live) refuses exactly like locked", () => {
    // R2-34: this test used to pair the channel-side staged case with a LOCKED
    // market, so the market half of the staged refusal was never exercised.
    expect(() => requireActiveChannel("google")).toThrow(/staged/);
    expect(() => requireActiveMarket("EU")).toThrow(/locked/);
    expect(() => requireActiveChannel("tiktok")).toThrow(/locked/);
    expect(() => requireActiveChannel("unknown-channel")).toThrow(SwitchboardError);
    expect(() => requireActiveMarket("unknown-market")).toThrow(SwitchboardError);
  });

  it("market entries carry the §2.5 bundle slots so later phases fill, not reshape", () => {
    const us = requireActiveMarket("US");
    expect(us.jurisdictionPack).not.toBeNull(); // no pack, no ads
    expect(Object.keys(MARKETS["US"] ?? {})).toEqual(
      expect.arrayContaining(["jurisdictionPack", "paymentAdapters", "languagePacks", "localeClock", "dataResidency"]),
    );
  });
});

/** x8 X-03 → x10 X-04 (GPT-6 Luna, 2026-10-10): an "on" status alone
 * activated a flag, and then a named report did. Only the launch set can be
 * on in Phase 0. MUTATION: X8-03a, X8-03b, X8-03d, X8-03e. */
describe("only the launch set can be on, with a complete bundle (x8 X-03, x10 X-04)", () => {
  const fullChannel = { status: "on" as const, writeAdapter: "a", decisionAdversaryRules: "r", fatigueModel: "f" };
  const fullMarket = { status: "on" as const, jurisdictionPack: "p", paymentAdapters: ["stripe"], languagePacks: ["en"], localeClock: null, dataResidency: "eu" };
  const launch: Activation = { basis: "launch" };
  const claimedBundle = { basis: "bundle", adversaryReport: "ADVERSARY_REPORT_fake.md", liveData: true } as unknown as Activation;

  it("TikTok on — by status alone, by claiming launch, or by naming a PASS report — is refused", () => {
    expect(() => assertActivationEarned("channel", "tiktok", undefined, channelBundleGaps(fullChannel)), "status alone activated a channel").toThrow(/outside the launch set/);
    expect(() => assertActivationEarned("channel", "tiktok", launch, channelBundleGaps(fullChannel)), "a non-launch channel claimed the launch basis").toThrow(/outside the launch set/);
    expect(() => assertActivationEarned("channel", "tiktok", claimedBundle, channelBundleGaps(fullChannel)), "a named report activated a channel (x10 X-04)").toThrow(/outside the launch set/);
  });

  it("an incomplete bundle is refused even for the launch set", () => {
    expect(() => assertActivationEarned("market", "US", launch, marketBundleGaps({ ...fullMarket, jurisdictionPack: null })), "a market with no jurisdiction pack activated").toThrow(/incomplete bundle \(jurisdictionPack\)/);
    expect(() => assertActivationEarned("market", "US", launch, marketBundleGaps({ ...fullMarket, paymentAdapters: [], languagePacks: [], dataResidency: null }))).toThrow(/paymentAdapters, languagePacks, dataResidency/);
    expect(() => assertActivationEarned("channel", "meta", launch, channelBundleGaps({ ...fullChannel, writeAdapter: null }))).toThrow(/incomplete bundle \(writeAdapter\)/);
  });

  it("the accessors themselves refuse the finding's edits: TikTok on, EU on with a claimed report", () => {
    const tiktokOn = { ...CHANNELS, tiktok: { ...CHANNELS["tiktok"]!, ...fullChannel, activation: claimedBundle } };
    expect(() => resolveActiveChannelForTests(tiktokOn, "tiktok"), "TikTok activated").toThrow(SwitchboardError);
    const euOn = { ...MARKETS, EU: { ...MARKETS["EU"]!, ...fullMarket, activation: claimedBundle } };
    expect(() => resolveActiveMarketForTests(euOn, "EU"), "EU activated").toThrow(/outside the launch set/);
    const usNoPack = { ...MARKETS, US: { ...MARKETS["US"]!, jurisdictionPack: null } };
    expect(() => resolveActiveMarketForTests(usNoPack, "US"), "US activated with no jurisdiction pack").toThrow(/jurisdictionPack/);
  });

  it("the launch set (US, Meta) resolves from the real registry", () => {
    expect(() => assertActivationEarned("market", "US", launch, [])).not.toThrow();
    expect(requireActiveMarket("US").activation).toEqual({ basis: "launch" });
    expect(requireActiveChannel("meta").activation).toEqual({ basis: "launch" });
  });
});

/** x9 X-03 (GPT-6 Luna, 2026-10-10): the exported resolvers resolved any
 * caller-built table. MUTATION: X9-03a, X9-03b. */
describe("x9 only the frozen registry resolves outside the test runner", () => {
  it("the test-only resolvers refuse outside the runner, even for a complete forged entry", () => {
    const forged = { tiktok: { status: "on" as const, writeAdapter: "a", decisionAdversaryRules: "r", fatigueModel: "f", activation: { basis: "launch" as const } } };
    const forgedMarket = { EU: { status: "on" as const, jurisdictionPack: "p", paymentAdapters: ["s"], languagePacks: ["en"], localeClock: null, dataResidency: "eu", activation: forged.tiktok.activation } };
    const g = globalThis as Record<string, unknown>;
    const saved = g["__vitest_worker__"];
    delete g["__vitest_worker__"];
    try {
      expect(() => resolveActiveChannelForTests(forged, "tiktok"), "a forged channel table resolved outside the runner").toThrow(/outside a test runner/);
      expect(() => resolveActiveMarketForTests(forgedMarket, "EU"), "a forged market table resolved outside the runner").toThrow(/outside a test runner/);
    } finally {
      g["__vitest_worker__"] = saved;
    }
  });
});
