/** A queue-driven global fetch, installed when this module is EVALUATED.
 *
 * Import it FIRST in a test file that runs a live eval: the production
 * adapter captures the runtime's fetch when its module loads, and a live eval
 * refuses any other (x8 X-04). That a fetch installed before the adapter
 * loads is indistinguishable from the runtime's own is the stated limit of
 * that check (L12) — this module is that limit, used on purpose so the AC2
 * tests can drive the live path without a network. */
/** ONE stub per process, kept on a global symbol (2026-10-23). The shared-
 * registry stages load this as a setup file, which vitest re-evaluates for
 * every test file; a fresh function each time stopped being the fetch the
 * adapter captured, and every live eval after the first file refused. Re-
 * evaluation now re-installs the SAME function, queue and log. */
const SLOT = Symbol.for("fullburn.test.live-fetch-stub");
type Stub = { queue: unknown[]; calls: string[]; fetch: typeof fetch };
const g = globalThis as unknown as Record<symbol, Stub | undefined>;
const stub: Stub = (g[SLOT] ??= (() => {
  const queue: unknown[] = [];
  const calls: string[] = [];
  const f = (async (url: string, init: { body: string }) => {
    calls.push(`${url} model=${String((JSON.parse(String(init.body)) as { model?: unknown }).model)}`);
    if (queue.length === 0) return new Response("no queued output", { status: 500 });
    const content = JSON.stringify(queue.shift());
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { queue, calls, fetch: f };
})());

export const liveQueue: unknown[] = stub.queue;
export const liveCalls: string[] = stub.calls;

globalThis.fetch = stub.fetch;
