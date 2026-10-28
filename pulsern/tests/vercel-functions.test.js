/* Vercel's Hobby plan deploys at most 12 serverless functions, and every
   file in api/ counts unless its name starts with an underscore. Shared
   helpers are underscored so they never use up the allowance; this keeps
   the count honest and leaves room for new endpoints. */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";

describe("serverless function allowance", () => {
  it("stays within Vercel's 12-function Hobby limit, with room to spare", () => {
    const fns = readdirSync("api").filter((f) => /\.(m?js|ts)$/.test(f) && !f.startsWith("_"));
    expect(fns.length, `api/ functions: ${fns.join(", ")}`).toBeLessThanOrEqual(11);
  });
});
