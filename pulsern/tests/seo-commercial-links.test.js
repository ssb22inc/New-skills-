import { describe, expect, it } from "vitest";
import { COMMERCIAL_PAGES, relatedCommercial } from "../ops/commercial-content.mjs";

describe("commercial internal links", () => {
  it("distributes three unique related links to every comparison page", () => {
    const inbound = new Map(COMMERCIAL_PAGES.map((page) => [page.slug, 0]));
    for (const page of COMMERCIAL_PAGES) {
      const recommendations = relatedCommercial(page.slug);
      expect(recommendations).toHaveLength(3);
      expect(new Set(recommendations.map((item) => item.slug)).size).toBe(3);
      expect(recommendations.some((item) => item.slug === page.slug)).toBe(false);
      for (const recommendation of recommendations) inbound.set(recommendation.slug, inbound.get(recommendation.slug) + 1);
    }
    expect(Math.min(...inbound.values())).toBe(3);
    expect(Math.max(...inbound.values())).toBe(3);
  });
});
