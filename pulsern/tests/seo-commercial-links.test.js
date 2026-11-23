import { describe, expect, it } from "vitest";
import { COMMERCIAL_PAGES, relatedCommercial } from "../ops/commercial-content.mjs";

describe("commercial internal links", () => {
  it("publishes no comparison pages and therefore no related comparison links", () => {
    expect(COMMERCIAL_PAGES).toEqual([]);
    expect(relatedCommercial("compare")).toEqual([]);
    expect(relatedCommercial("compare/methodology")).toEqual([]);
  });
});
