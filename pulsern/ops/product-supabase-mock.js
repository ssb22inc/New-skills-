const offline = { data: null, error: new Error("product screenshot offline fixture") };

const query = new Proxy({}, {
  get(_target, property) {
    if (property === "then") return (resolve, reject) => Promise.resolve(offline).then(resolve, reject);
    return () => query;
  },
});

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: () => query,
};
