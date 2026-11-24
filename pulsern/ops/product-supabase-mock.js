/* The screenshot harness renders the real app with no network. A missing
   session is a failed read (the app must not invent an empty account), so
   this fixture signs in as an empty account: the progress read succeeds
   and returns no row. That is the same screen a brand-new student sees. */
const offline = { data: null, error: new Error("product screenshot offline fixture") };
const emptyAccount = { data: null, error: null };

function chain(result) {
  const api = new Proxy({}, {
    get(_target, property) {
      if (property === "then") return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      if (property === "maybeSingle" || property === "single") return async () => result;
      if (property === "upsert" || property === "insert" || property === "update") return () => chain({ data: [{ revision: 1 }], error: null });
      if (property === "abortSignal" || property === "select") return () => api;
      return () => api;
    },
  });
  return api;
}

export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: { user: { id: "product-screenshot", created_at: "2020-01-01T00:00:00.000Z" } } },
      error: null,
    }),
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signOut: async () => ({ error: null }),
  },
  from(table) {
    if (table === "progress") return chain(emptyAccount);
    return chain(offline);
  },
};
