import { describe, expect, it } from "vitest";
import { MARKETS, SwitchboardError, activeMarkets, requireActiveMarket } from "@fullburn/config/markets";
import { CHANNELS, activeChannels, requireActiveChannel } from "@fullburn/config/channels";

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
