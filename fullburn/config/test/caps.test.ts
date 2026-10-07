import { describe, expect, it } from "vitest";
import { CAPS_TABLE, CapError, assertCapsUsable, getCaps } from "@fullburn/config/caps";

describe("caps (Law 2, AC 5, R2)", () => {
  it("runtime mutation of a cap fails", () => {
    const caps = getCaps("pulsern");
    expect(() => {
      (caps as { dailyAdSpendUsd: number }).dailyAdSpendUsd = 999_999;
    }).toThrow(TypeError);
    expect(getCaps("pulsern").dailyAdSpendUsd).toBe(66);
  });

  it("adding a new client cap at runtime fails", () => {
    expect(() => {
      (CAPS_TABLE as Record<string, unknown>)["attacker"] = { dailyAdSpendUsd: 1e9 };
    }).toThrow(TypeError);
    expect(() => getCaps("attacker")).toThrow(CapError);
  });

  it("unknown client has NO cap and cannot spend (no defaults, fail closed)", () => {
    expect(() => getCaps("never-onboarded")).toThrow(/spend is forbidden/);
    expect(() => getCaps("")).toThrow(CapError);
  });

  it("a caller cannot supply its own caps table at all (R2-03)", () => {
    // getCaps takes exactly one argument: the client id. There is no parameter
    // by which a caller can hand in a different table, so the malformed-table
    // case this test used to construct is now unrepresentable.
    expect(getCaps.length).toBe(1);
  });

  it("caps without human sign-off (H8) are structurally unusable", () => {
    // Client zero is SIGNED as of H8 (2026-08-16), so this invariant needs a
    // client that is genuinely unsigned — otherwise it would have to be deleted
    // the moment the human signed, taking the guard with it.
    expect(() => assertCapsUsable(getCaps("fixture-unsigned"))).toThrow(/human sign-off/);
    expect(() => assertCapsUsable(getCaps("pulsern"), "pulsern")).not.toThrow();
  });
});
