import { describe, expect, it } from "vitest";
import { CAPS_TABLE, CapError, assertCapsUsable, getCaps } from "@fullburn/config/caps";

describe("caps (Law 2, AC 5, R2)", () => {
  it("runtime mutation of a cap fails", () => {
    const caps = getCaps("pulsern");
    expect(() => {
      (caps as { dailyAdSpendUsd: number }).dailyAdSpendUsd = 999_999;
    }).toThrow(TypeError);
    expect(getCaps("pulsern").dailyAdSpendUsd).toBe(70);
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

  it("malformed caps throw instead of flowing into silent comparisons", () => {
    const bad = { c: { dailyAdSpendUsd: undefined as unknown as number, totalAdSpendUsd: 1, dailyAiSpendUsd: 1, humanSignoff: "x" } };
    expect(() => getCaps("c", bad)).toThrow(/finite positive/);
    const negative = { c: { dailyAdSpendUsd: -5, totalAdSpendUsd: 1, dailyAiSpendUsd: 1, humanSignoff: "x" } };
    expect(() => getCaps("c", negative)).toThrow(/finite positive/);
  });

  it("caps without human sign-off (H8) are structurally unusable", () => {
    expect(() => assertCapsUsable(getCaps("pulsern"))).toThrow(/human sign-off/);
  });
});
