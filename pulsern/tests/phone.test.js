import { describe, it, expect } from "vitest";
import { normalizePhone } from "../src/phone.js";

describe("phone normalization", () => {
  it("accepts common US formats and returns E.164", () => {
    expect(normalizePhone("(786) 408-4357")).toBe("+17864084357");
    expect(normalizePhone("786-408-4357")).toBe("+17864084357");
    expect(normalizePhone("786.408.4357")).toBe("+17864084357");
    expect(normalizePhone("17864084357")).toBe("+17864084357");
    expect(normalizePhone("+1 786 408 4357")).toBe("+17864084357");
  });
  it("passes through international numbers with sanity bounds", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("+4420")).toBeNull(); // too short
  });
  it("rejects garbage", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("0786408435")).toBeNull(); // leading 0, not US
    expect(normalizePhone(null)).toBeNull();
  });
});
