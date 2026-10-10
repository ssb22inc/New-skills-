/** A queue-driven global fetch, installed when this module is EVALUATED.
 *
 * Import it FIRST in a test file that runs a live eval: the production
 * adapter captures the runtime's fetch when its module loads, and a live eval
 * refuses any other (x8 X-04). That a fetch installed before the adapter
 * loads is indistinguishable from the runtime's own is the stated limit of
 * that check (L12) — this module is that limit, used on purpose so the AC2
 * tests can drive the live path without a network. */
export const liveQueue: unknown[] = [];
export const liveCalls: string[] = [];

globalThis.fetch = (async (url: string, init: { body: string }) => {
  liveCalls.push(`${url} model=${String((JSON.parse(String(init.body)) as { model?: unknown }).model)}`);
  if (liveQueue.length === 0) return new Response("no queued output", { status: 500 });
  const content = JSON.stringify(liveQueue.shift());
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), { status: 200 });
}) as unknown as typeof fetch;
