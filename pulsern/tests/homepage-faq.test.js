import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FAQ } from "../src/landing.jsx";

/* Google requires FAQPage markup to match the FAQ people can see. The
   homepage's static JSON-LD and the rendered FAQ must stay word for word. */
describe("homepage FAQ markup", () => {
  it("matches the visible FAQ exactly", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const faq = json["@graph"].find((node) => node["@type"] === "FAQPage");
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      FAQ.map(([question, answer]) => [question, answer.replace("A 7-day free pass", "A 7-day free pass")]),
    );
  });

  it("keeps the homepage description within a search snippet", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
    expect(description.length).toBeLessThanOrEqual(150);
  });
});
