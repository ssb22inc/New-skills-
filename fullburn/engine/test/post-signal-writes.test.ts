import { describe, expect, it } from "vitest";
import { postSignalWrites } from "./post-signal-writes.ts";

/** THE DRILL'S DETECTOR, RED-PROOFED IN THE DEFAULT SUITE.
 *
 * The drill itself cannot prove its own detector works — it runs under its own
 * runner and `npm test` never executes it, so deleting every detection path
 * inside it left `npm run drill` reporting PASS with all five gates green
 * (adversary finding R14-06). That is the R9-01 defect living in the one file
 * the project points at when it wants to say a property was proved by
 * execution. The decision now lives in a pure function, and here is the proof
 * it can say yes AND no. */
describe("post-signal write detection (R13-05's mechanism, R14-06's red-proof)", () => {
  const files = ["/src/a.ts", "/src/b.ts"];
  const atSignal = new Map([
    ["/src/a.ts", "MUTATED-A"],
    ["/src/b.ts", "clean-B"],
  ]);
  const originals = new Map([["/src/a.ts", "original-A"]]);

  it("reports nothing when every file is unchanged", () => {
    expect(postSignalWrites({ watch: files, atSignal, originals, read: (f) => atSignal.get(f) ?? null })).toEqual([]);
  });

  it("does NOT report the restore — that is what the signal is for", () => {
    const read = (f: string) => (f === "/src/a.ts" ? "original-A" : "clean-B");
    expect(postSignalWrites({ watch: files, atSignal, originals, read })).toEqual([]);
  });

  it("REPORTS a file mutated after the signal", () => {
    // b was clean at the signal and is now mutated: nobody restored it to that.
    const read = (f: string) => (f === "/src/b.ts" ? "MUTATED-B" : "MUTATED-A");
    expect(
      postSignalWrites({ watch: files, atSignal, originals, read }),
      "a post-signal write was not reported — the drill would pass while source was rewritten",
    ).toEqual(["/src/b.ts"]);
  });

  it("REPORTS a file re-mutated to a THIRD state, not just any change", () => {
    // a went MUTATED-A → original-A → MUTATED-A-AGAIN: the restore happened and
    // then the harness carried on, which is exactly R9-03's harm.
    const read = (f: string) => (f === "/src/a.ts" ? "MUTATED-A-AGAIN" : "clean-B");
    expect(postSignalWrites({ watch: files, atSignal, originals, read })).toEqual(["/src/a.ts"]);
  });

  it("ignores a file it cannot read rather than inventing a violation", () => {
    expect(postSignalWrites({ watch: files, atSignal, originals, read: () => null })).toEqual([]);
  });

  it("does not pass vacuously on an empty watch list", () => {
    // An empty list reports nothing, which is correct — and is why the drill
    // asserts separately that it watched the file it mutated.
    expect(postSignalWrites({ watch: [], atSignal, originals, read: () => "anything" })).toEqual([]);
  });
});
