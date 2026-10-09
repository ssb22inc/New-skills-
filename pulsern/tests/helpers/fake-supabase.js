/* An in-memory stand-in for the Supabase client, faithful to the one property
   these tests are about: a select with no explicit range returns at most
   SERVER_MAX rows and says nothing. Filters, ordering, ranges and exact head
   counts behave like PostgREST's for the subset of the API the handlers use. */
export const SERVER_MAX = 1000;

export function fakeSupabase(tables, { users = {} } = {}) {
  const calls = [];
  const from = (table) => {
    const filters = [];
    let order = null, range = null, head = false, count = false;
    const rowsOf = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (order) rows = [...rows].sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0));
      return rows;
    };
    const run = () => {
      const all = rowsOf();
      calls.push({ table, ranged: !!range, head });
      if (head) return { data: null, count: all.length, error: null };
      const page = range ? all.slice(range[0], range[1] + 1) : all;
      return { data: page.slice(0, SERVER_MAX), count: count ? all.length : null, error: null };
    };
    const b = {
      select(_cols, opts = {}) { head = !!opts.head; count = opts.count === "exact"; return b; },
      eq(k, v) { filters.push((r) => r[k] === v); return b; },
      is(k, v) { filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return b; },
      not(k, op, v) { if (op === "is" && v === null) filters.push((r) => r[k] != null); return b; },
      gte(k, v) { filters.push((r) => r[k] >= v); return b; },
      order(k) { order = k; return b; },
      range(a, z) { range = [a, z]; return Promise.resolve(run()); },
      maybeSingle() { const { data } = run(); return Promise.resolve({ data: data?.[0] ?? null, error: null }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return {
    from,
    calls,
    auth: { getUser: async (t) => (users[t] ? { data: { user: users[t] }, error: null } : { data: { user: null }, error: { message: "bad token" } }) },
  };
}

export const fakeRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
