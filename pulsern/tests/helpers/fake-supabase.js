/* An in-memory stand-in for the Supabase client, faithful to the one property
   these tests are about: a select with no explicit range returns at most
   SERVER_MAX rows and says nothing. Filters, ordering, ranges and exact head
   counts behave like PostgREST's for the subset of the API the handlers use. */
export const SERVER_MAX = 1000;

/* Writes (insert / update / delete) are supported for the endpoints that
   make them. `unique` lists, per table, column sets that must not repeat
   (a primary key); a clash returns Postgres's 23505 error like PostgREST.
   `defaults` fills server-side column defaults on insert. */
export function fakeSupabase(tables, { users = {}, unique = {}, defaults = {} } = {}) {
  const calls = [];
  const from = (table) => {
    const filters = [];
    let order = null, range = null, head = false, count = false;
    let op = "select", payload = null;
    const rowsOf = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (order) rows = [...rows].sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0));
      return rows;
    };
    const write = () => {
      tables[table] ??= [];
      if (op === "insert") {
        const incoming = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...(defaults[table]?.() ?? {}), ...r }));
        for (const r of incoming) {
          for (const cols of unique[table] ?? []) {
            if (tables[table].some((x) => cols.every((c) => x[c] === r[c]))) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
          }
          tables[table].push(r);
        }
        return { data: incoming, error: null };
      }
      const hit = rowsOf();
      if (op === "update") { for (const r of hit) Object.assign(r, payload); return { data: hit, error: null }; }
      tables[table] = tables[table].filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    };
    const run = () => {
      if (op !== "select") { calls.push({ table, op }); return write(); }
      const all = rowsOf();
      calls.push({ table, ranged: !!range, head });
      if (head) return { data: null, count: all.length, error: null };
      const page = range ? all.slice(range[0], range[1] + 1) : all;
      return { data: page.slice(0, SERVER_MAX), count: count ? all.length : null, error: null };
    };
    const b = {
      select(_cols, opts = {}) { head = !!opts.head; count = opts.count === "exact"; return b; },
      insert(rows) { op = "insert"; payload = rows; return b; },
      update(patch) { op = "update"; payload = patch; return b; },
      delete() { op = "delete"; return b; },
      eq(k, v) { filters.push((r) => r[k] === v); return b; },
      is(k, v) { filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return b; },
      not(k, op, v) { if (op === "is" && v === null) filters.push((r) => r[k] != null); return b; },
      gte(k, v) { filters.push((r) => r[k] >= v); return b; },
      order(k) { order = k; return b; },
      range(a, z) { range = [a, z]; return Promise.resolve(run()); },
      maybeSingle() { const { data } = run(); return Promise.resolve({ data: data?.[0] ?? null, error: null }); },
      single() {
        const { data, error } = run();
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve(data?.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "not exactly one row" } });
      },
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
