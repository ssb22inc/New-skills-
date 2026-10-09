import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { META_CANARIES, mergeShardResults, parseShardFlags, shardEntries } from "../scripts/mutate-lib.mjs";

/** SHARDED HARNESS RUNS (human decision 2026-10-09): the decisions that make
 * N partial runs one valid run, driven here. MUTATION: MS-01..MS-06. */
const canaries = (META_CANARIES as { name: string }[]).map((c) => `  ok   ${c.name}`).join("\n");
const shardOut = (entries: string[], extra = "") => {
  const s = entries.filter((l) => l.startsWith("*** SURVIVED")).length;
  const n = entries.filter((l) => l.startsWith("PATTERN-NOT-FOUND")).length;
  return `META-CHECK\n${canaries}\n\n${entries.join("\n")}\n\n${entries.length} mutations: ${entries.length - s - n} caught, ${s} survived, ${n} not found\n${extra}`;
};
const caught = (name: string) => `CAUGHT             ${name}  |  1 failed`;

describe("sharded mutation runs", () => {
  it("parses the flags strictly", () => {
    expect(parseShardFlags([])).toEqual({ mode: "serial" });
    expect(parseShardFlags(["--shards", "3"])).toEqual({ mode: "parent", shards: 3 });
    expect(parseShardFlags(["--shards", "1"])).toEqual({ mode: "serial" });
    expect(parseShardFlags(["--shard", "2/3"])).toEqual({ mode: "child", shard: 2, shards: 3 });
    for (const bad of [["--shards", "0"], ["--shards", "x"], ["--shards"], ["--shard", "3/3"], ["--shard", "1"], ["--shards", "2", "--shard", "0/2"]]) {
      expect(parseShardFlags(bad).error, `${bad.join(" ")} was accepted`).toBeDefined();
    }
  });

  it("the shards cover the table exactly once", () => {
    const table = Array.from({ length: 11 }, (_, k) => k);
    const parts = [0, 1, 2].map((i) => shardEntries(table, i, 3));
    expect(parts.flat().sort((a, b) => a - b)).toEqual(table);
    expect(parts.map((p) => p.length)).toEqual([4, 4, 3]);
  });

  it("merges complete shards into one run, counting survivors and stale entries", () => {
    const runs = [
      { code: 0, owns: 2, out: shardOut([caught("a"), caught("b")]) },
      { code: 1, owns: 2, out: shardOut([caught("c"), "*** SURVIVED ***   d"]) },
      { code: 1, owns: 1, out: shardOut(["PATTERN-NOT-FOUND  e  (f.ts)"]) },
    ];
    const m = mergeShardResults(runs, 5);
    expect(m).toMatchObject({ ok: true, total: 5, caught: 3, survived: 1, notFound: 1 });
    expect(m.lines).toHaveLength(5);
  });

  it("any incomplete, unvalidated or crashed shard voids the whole run", () => {
    const good = { code: 0, owns: 1, out: shardOut([caught("a")]) };
    const void_ = (runs: unknown[], total = runs.length) => mergeShardResults(runs, total).ok;
    expect(void_([good, { ...good, code: 130 }]), "an interrupted shard counted").toBe(false);
    expect(void_([good, { ...good, out: shardOut([caught("a")]).replace(/ {2}ok {3}positive[^\n]*\n/, "") }]), "a shard without its positive canary counted").toBe(false);
    expect(void_([good, { ...good, out: shardOut([caught("a")]).replace(/\d+ mutations:[^\n]*/, "") }]), "a shard with no summary counted").toBe(false);
    // Totals that add up (1 + 2 = 3) with one shard short: only the per-shard count sees it.
    expect(void_([good, { ...good, owns: 2 }], 3), "a shard that reported fewer entries than it owns counted").toBe(false);
    expect(void_([good, good], 3), "two shards covering two of three entries made a total").toBe(false);
    expect(void_([]), "no shards made a total").toBe(false);
    expect(void_([good, good])).toBe(true);
  });
});
