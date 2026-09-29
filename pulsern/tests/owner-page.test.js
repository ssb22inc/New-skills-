/* The owner dashboard's inline JavaScript must parse.
   ------------------------------------------------------------------
   public/owner/index.html is plain static HTML with one inline <script>. It
   goes through no bundler, no transpiler and no linter, so nothing was
   checking it. A duplicate `const esc` declaration shipped and took the whole
   page down: a SyntaxError aborts the entire block, so signIn() was never
   defined and the Sign in button silently did nothing. The owner could sign in
   everywhere else, which made it look like an account or permissions problem
   rather than a parse error.

   This is the cheapest possible guard against that whole class of fault, and
   it covers the review console too, which is built the same way. */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const PAGES = ["public/owner/index.html", "public/review/index.html"];

/* Inline blocks only: a <script src> is someone else's file. */
const inlineScripts = (html) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe("static owner pages", () => {
  for (const page of PAGES) {
    const path = new URL(`../${page}`, import.meta.url).pathname;
    if (!existsSync(path)) continue;

    it(`${page} has inline script that parses`, () => {
      const scripts = inlineScripts(readFileSync(path, "utf8"));
      expect(scripts.length).toBeGreaterThan(0);
      for (const src of scripts) {
        /* Compiling is enough: it raises on a syntax error without running
           anything, so no browser and no network are needed. */
        expect(() => new vm.Script(src)).not.toThrow();
      }
    });

    it(`${page} declares each top-level helper exactly once`, () => {
      /* The duplicate that broke the page was a second `const esc`. Redeclaring
         a const in the same scope is fatal, and it is an easy mistake when
         appending a feature to a long inline script. */
      const src = inlineScripts(readFileSync(path, "utf8")).join("\n");
      const names = [...src.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)]
        .map((m) => m[1]);
      const seen = new Set();
      const duplicated = names.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
      expect(duplicated).toEqual([]);
    });
  }

  it("the owner page still defines the entry points its buttons call", () => {
    /* A parse error is not the only way a button can go dead -- a rename would
       do it too -- and these are the handlers wired to onclick in the markup. */
    const html = readFileSync(new URL("../public/owner/index.html", import.meta.url).pathname, "utf8");
    for (const fn of ["signIn", "showTab", "runCheck", "runFunnel"]) {
      expect(html).toMatch(new RegExp(`(?:function|const|async function)\\s+${fn}\\b`));
    }
  });
});
