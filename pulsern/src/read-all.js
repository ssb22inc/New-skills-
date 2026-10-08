/* Reading every row, not the first thousand.
   ------------------------------------------------------------------
   Supabase returns at most 1,000 rows from a plain select unless asked for a
   range. Nothing errors and nothing warns — the 1,001st row simply is not
   there. That is how the marketing API's category breakdown came to sum to
   exactly 1,000 against a bank of 10,034, and it is the same silent cap that
   would make the funnel undercount the day events pass a thousand.

   Two details matter, and the obvious loop gets the second one wrong:

   - Pages need a stable order, or rows can be skipped or repeated between
     requests. Callers pass the order; readAll() refuses a query without one.

   - The loop must stop on an EMPTY page, not a SHORT one. The server's cap is
     configurable; if it is lower than the page size asked for, every page is
     "short", and a loop that stops on a short page stops after the first one —
     reproducing exactly the truncation this exists to prevent. Advancing by
     the rows actually returned is correct whatever the cap is. */

export const PAGE_SIZE = 1000;
/* Far above anything PulseRN holds today. Exists so a wrong filter cannot
   pull an unbounded table into a serverless function's memory. */
export const MAX_ROWS = 250_000;

export async function readAll(makeQuery, { pageSize = PAGE_SIZE, maxRows = MAX_ROWS, ordered = false } = {}) {
  if (!ordered) {
    throw new Error("readAll needs a stable order: build the query with .order(...) and pass { ordered: true }");
  }
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message ?? String(error));
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
    from += page.length;
    if (rows.length > maxRows) throw new Error(`readAll stopped at ${maxRows.toLocaleString()} rows; narrow the query`);
  }
}

/* Category counts with a cross-check. The tally must add up to the
   independently counted total; if it does not (rows inserted between the two
   reads, or a filter that differs between them), that is reported rather than
   smoothed over. A breakdown that silently disagrees with its own headline is
   how the 1,000-row cap went unnoticed. */
export function tallyBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
}

export function reconcile(tally, expectedTotal) {
  const sum = Object.values(tally).reduce((a, b) => a + b, 0);
  return { sum, expected: expectedTotal, ok: expectedTotal == null ? null : sum === expectedTotal };
}
