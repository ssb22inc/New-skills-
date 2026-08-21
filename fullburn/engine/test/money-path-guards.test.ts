import { describe, expect, it } from "vitest";
import { codeOnly, moneyPathModules, unfollowable, withoutComments } from "./money-path-guards.ts";

/** THE DERIVATION'S OWN RED-PROOFS.
 *
 * R13-06 replaced a hand-written module list with an import walk, and R14-03
 * found the walk had four blind spots — a dynamic import, a side-effect import,
 * a member-expression `throw`, and a specifier mentioned in a COMMENT becoming
 * a phantom module. Each is driven here, because "the population is complete
 * today" is what the previous two boundaries could also have said. */
describe("the money-path derivation refuses what it cannot follow (R14-03)", () => {
  const files = (map: Record<string, string>) =>
    moneyPathModules(new URL("file:///w/"), (f) => f in map, (f) => map[f] ?? "");

  it("follows a side-effect import, which has no `from`", () => {
    const pop = files({
      "engine/src/gateway.ts": 'import "./side-effect.ts";',
      "engine/src/side-effect.ts": "export const x = 1;",
    });
    expect(pop, "a side-effect import was invisible to the population").toContain("engine/src/side-effect.ts");
  });

  it("does NOT invent a module from a specifier inside a comment or a string", () => {
    const pop = files({
      "engine/src/gateway.ts": '// see from "./ghost.ts" for why\nconst s = \'from "./ghost2.ts"\';\n',
      "engine/src/ghost.ts": "",
      "engine/src/ghost2.ts": "",
    });
    expect(pop, "a phantom module entered the population from prose").toEqual(["engine/src/gateway.ts"]);
  });

  it("REFUSES a dynamic import rather than silently missing the module", () => {
    expect(unfollowable("a.ts", 'const m = await import("./dynamic.ts");')[0]).toMatch(/dynamic import/);
    expect(unfollowable("a.ts", 'import { x } from "./static.ts";')).toEqual([]);
  });

  it("REFUSES a throw the guard scan cannot read, and allows the two that are not guards", () => {
    expect(unfollowable("a.ts", 'throw new Errors.CapError("x");')[0]).toMatch(/cannot read/);
    expect(unfollowable("a.ts", 'throw makeError("x");')[0]).toMatch(/cannot read/);
    expect(unfollowable("a.ts", "throw new (cond ? A : B)('x');")[0]).toMatch(/cannot read/);
    // The allow list: a bare re-throw, and a re-throw through the redactor.
    expect(unfollowable("a.ts", "throw err;")).toEqual([]);
    expect(unfollowable("a.ts", "throw redactError(err, secrets, GatewayError);")).toEqual([]);
    // …and the ordinary guard form is not refused, so this discriminates.
    expect(unfollowable("a.ts", 'throw new CapError("x");')).toEqual([]);
  });

  it("blanks rather than deletes, so a refusal names the line a reader will find", () => {
    const src = "line1\n/* two\n   three */\nthrow makeError();\n";
    expect(withoutComments(src).split("\n").length).toBe(src.split("\n").length);
    expect(codeOnly(src).split("\n").length).toBe(src.split("\n").length);
    expect(unfollowable("a.ts", src)[0]).toContain("a.ts:4");
  });

  it("keeps STRINGS for the import scan — blanking both emptied the population", () => {
    expect(withoutComments('import { x } from "./y.ts";')).toContain('"./y.ts"');
    expect(codeOnly('const s = "./y.ts";')).not.toContain("./y.ts");
  });
});
