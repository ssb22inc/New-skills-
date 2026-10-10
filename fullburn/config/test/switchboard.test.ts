import { describe, expect, it } from "vitest";
import { MARKETS, SwitchboardError, activeMarkets, assertActivationEarned, marketBundleGaps, requireActiveMarket, resolveActiveMarket, type Activation } from "@fullburn/config/markets";
import { CHANNELS, activeChannels, channelBundleGaps, requireActiveChannel, resolveActiveChannel } from "@fullburn/config/channels";
import { existsSync, readFileSync } from "node:fs";

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

/** x8 X-03 (GPT-6 Luna, 2026-10-10): an "on" status alone activated a flag.
 * MUTATION: X8-03a..d. */
describe("an active flag carries its earned basis and a complete bundle (x8 X-03)", () => {
  const fullChannel = { status: "on" as const, writeAdapter: "a", decisionAdversaryRules: "r", fatigueModel: "f" };
  const fullMarket = { status: "on" as const, jurisdictionPack: "p", paymentAdapters: ["stripe"], languagePacks: ["en"], localeClock: null, dataResidency: "eu" };
  const bundle: Activation = { basis: "bundle", adversaryReport: "ADVERSARY_REPORT_tiktok.x1.md", liveData: true };

  it("TikTok flipped on by status alone is refused; with its bundle and a live-data PASS named, it activates", () => {
    expect(() => assertActivationEarned("channel", "tiktok", undefined, channelBundleGaps(fullChannel)), "status alone activated a channel").toThrow(/without an earned activation/);
    expect(() => assertActivationEarned("channel", "tiktok", { basis: "launch" }, channelBundleGaps(fullChannel)), "a non-launch channel claimed the launch basis").toThrow(/without an earned activation/);
    expect(() => assertActivationEarned("channel", "tiktok", { ...bundle, liveData: false } as never, channelBundleGaps(fullChannel)), "a bundle without live data activated").toThrow(/without an earned activation/);
    expect(() => assertActivationEarned("channel", "tiktok", { ...bundle, adversaryReport: "../notes.md" }, channelBundleGaps(fullChannel))).toThrow(/without an earned activation/);
    expect(() => assertActivationEarned("channel", "tiktok", bundle, channelBundleGaps(fullChannel))).not.toThrow();
  });

  it("EU on with no jurisdiction pack is refused whatever its basis", () => {
    const eu = { ...fullMarket, jurisdictionPack: null };
    expect(() => assertActivationEarned("market", "EU", bundle, marketBundleGaps(eu)), "a market with no jurisdiction pack activated").toThrow(/incomplete bundle \(jurisdictionPack\)/);
    expect(() => assertActivationEarned("market", "EU", bundle, marketBundleGaps({ ...fullMarket, paymentAdapters: [], languagePacks: [], dataResidency: null }))).toThrow(/paymentAdapters, languagePacks, dataResidency/);
    expect(() => assertActivationEarned("channel", "tiktok", bundle, channelBundleGaps({ ...fullChannel, writeAdapter: null }))).toThrow(/incomplete bundle \(writeAdapter\)/);
  });

  it("the accessors themselves refuse the finding's two edits: TikTok on by status, EU on without a pack", () => {
    const tiktokOn = { ...CHANNELS, tiktok: { ...CHANNELS["tiktok"]!, status: "on" as const } };
    expect(() => resolveActiveChannel(tiktokOn, "tiktok"), "a status-only edit activated TikTok").toThrow(SwitchboardError);
    const euOn = { ...MARKETS, EU: { ...MARKETS["EU"]!, status: "on" as const, activation: bundle } };
    expect(() => resolveActiveMarket(euOn, "EU"), "EU activated with no jurisdiction pack").toThrow(/jurisdictionPack/);
  });

  it("the launch set (US, Meta) is the only launch basis, and the real registry resolves", () => {
    expect(() => assertActivationEarned("market", "US", { basis: "launch" }, [])).not.toThrow();
    expect(() => assertActivationEarned("market", "EU", { basis: "launch" }, []), "EU claimed the launch basis").toThrow();
    expect(requireActiveMarket("US").activation).toEqual({ basis: "launch" });
    expect(requireActiveChannel("meta").activation).toEqual({ basis: "launch" });
  });

  it("every bundle activation in the registry names a committed live-data adversary PASS", () => {
    const reports = new URL("../../reports/", import.meta.url);
    for (const [kind, table] of [["market", MARKETS], ["channel", CHANNELS]] as const) {
      for (const [code, e] of Object.entries(table)) {
        if (e.status !== "on" || e.activation?.basis !== "bundle") continue;
        const path = new URL(e.activation.adversaryReport, reports);
        expect(existsSync(path), `${kind} ${code} names a report that is not committed`).toBe(true);
        expect(readFileSync(path, "utf8"), `${kind} ${code}'s report is not a PASS`).toMatch(/^Verdict: PASS$/m);
      }
    }
  });
});
