/* The 1,000-row cap, tested against a fake that behaves like the real one.
   ------------------------------------------------------------------
   The fake enforces a server-side maximum, like PostgREST does. The decisive
   test is the one where that maximum is SMALLER than the page size asked for:
   the obvious loop ("stop when a page comes back short") stops after one page
   there and silently returns a fraction of the table. */
import { describe, it, expect } from "vitest";
import { readAll, tallyBy, reconcile } from "../src/read-all.js";

function fakeTable(n, { serverMax = 1000 } = {}) {
  const all = Array.from({ length: n }, (_, i) => ({ id: i + 1, cat: ["Pharm", "Mgmt", "Safety"][i % 3] }));
  let calls = 0;
  const make = () => ({
    range(from, to) {
      calls += 1;
      const want = to - from + 1;
      return Promise.resolve({ data: all.slice(from, from + Math.min(want, serverMax)), error: null });
    },
  });
  return { make, all, calls: () => calls };
}

describe("readAll", () => {
  it("reads past the 1,000-row cap — the bug in the marketing breakdown", async () => {
    const t = fakeTable(10_034);
    const rows = await readAll(t.make, { ordered: true });
    expect(rows).toHaveLength(10_034);
    expect(rows.at(-1).id).toBe(10_034);
  });

  /* The decisive case. A short-page loop returns 500 rows here. */
  it("stays correct when the server cap is lower than the page size", async () => {
    const t = fakeTable(2_300, { serverMax: 500 });
    const rows = await readAll(t.make, { ordered: true, pageSize: 1000 });
    expect(rows).toHaveLength(2_300);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_300); // nothing repeated
  });

  it("handles an exact multiple of the page size without losing the last page", async () => {
    const t = fakeTable(3_000);
    expect(await readAll(t.make, { ordered: true })).toHaveLength(3_000);
  });

  it("returns nothing for an empty table, in one request", async () => {
    const t = fakeTable(0);
    expect(await readAll(t.make, { ordered: true })).toEqual([]);
    expect(t.calls()).toBe(1);
  });

  /* Unordered paging can skip or repeat rows between requests. */
  it("refuses a query that does not declare a stable order", async () => {
    await expect(readAll(fakeTable(5).make)).rejects.toThrow(/stable order/);
  });

  it("surfaces a database error instead of returning a partial list", async () => {
    let n = 0;
    const make = () => ({ range: () => Promise.resolve(++n === 2 ? { data: null, error: { message: "timeout" } } : { data: [{ id: n }], error: null }) });
    await expect(readAll(make, { ordered: true, pageSize: 1 })).rejects.toThrow("timeout");
  });

  it("stops rather than pulling an unbounded table into memory", async () => {
    await expect(readAll(fakeTable(50).make, { ordered: true, pageSize: 10, maxRows: 25 })).rejects.toThrow(/stopped at 25/);
  });
});

describe("tallyBy and reconcile", () => {
  it("counts every row and adds up to the total", async () => {
    const rows = await readAll(fakeTable(10_034).make, { ordered: true });
    const t = tallyBy(rows, "cat");
    expect(reconcile(t, 10_034)).toEqual({ sum: 10_034, expected: 10_034, ok: true });
  });

  /* The original defect, as the reconcile check sees it. */
  it("flags a breakdown that disagrees with its own headline", () => {
    const capped = tallyBy(Array.from({ length: 1000 }, (_, i) => ({ cat: i % 2 ? "A" : "B" })), "cat");
    expect(reconcile(capped, 10_034)).toEqual({ sum: 1000, expected: 10_034, ok: false });
  });

  it("orders categories largest first, ties alphabetically", () => {
    expect(Object.keys(tallyBy([{ c: "b" }, { c: "a" }, { c: "z" }, { c: "z" }], "c"))).toEqual(["z", "a", "b"]);
  });

  it("does not pretend to reconcile against an unknown total", () => {
    expect(reconcile({ a: 1 }, null).ok).toBeNull();
  });
});
