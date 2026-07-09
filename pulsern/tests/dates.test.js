/* Local-date tests per PULSERN_BUILD.md §10.4:
   todayStr() equals a new Date()-derived local string;
   addDays(3) crosses month boundaries correctly. All dates LOCAL, never UTC. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fmtLocal, todayStr, addDays } from "../src/dates.js";

describe("local-date helpers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("todayStr matches a locally-derived date string", () => {
    vi.useRealTimers();
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayStr()).toBe(expected);
  });

  it("uses the LOCAL date, not the UTC date, late at night", () => {
    // 23:30 local on Jan 31 — toISOString().slice(0,10) would already say Feb 1
    // in any timezone east of UTC; the local helper must still say Jan 31.
    vi.setSystemTime(new Date(2026, 0, 31, 23, 30, 0));
    expect(todayStr()).toBe("2026-01-31");
  });

  it("addDays(3) crosses a month boundary correctly", () => {
    vi.setSystemTime(new Date(2026, 0, 30, 12, 0, 0)); // Jan 30
    expect(addDays(3)).toBe("2026-02-02");
  });

  it("addDays crosses a year boundary and leap February correctly", () => {
    vi.setSystemTime(new Date(2025, 11, 30, 12, 0, 0)); // Dec 30 2025
    expect(addDays(3)).toBe("2026-01-02");
    vi.setSystemTime(new Date(2028, 1, 27, 12, 0, 0)); // Feb 27 2028 (leap year)
    expect(addDays(3)).toBe("2028-03-01");
  });

  it("fmtLocal zero-pads month and day", () => {
    expect(fmtLocal(new Date(2026, 6, 9))).toBe("2026-07-09");
  });
});
