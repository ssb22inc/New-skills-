/** The production transport (cross-family finding X5-12, 2026-10-06): the
 * engine shipped only mock and recorded transports, so Phase 0's hello-world
 * AC had no path to a real AI Gateway even with credentials provisioned.
 *
 * WHAT IT SPEAKS: Cloudflare AI Gateway's OpenAI-compatible unified endpoint,
 * `<gatewayBaseUrl>compat/chat/completions`, with the model named by its
 * gateway route (`openai/gpt-5`, `anthropic/…`, `workers-ai/…`) — one wire
 * format for every family, so no provider host or SDK ever appears here
 * (Law 11). `llm()` hands this transport `new URL(model.gatewayRoute, base)`;
 * the route is recovered from that URL relative to the same base, and anything
 * outside the base is refused BEFORE dispatch.
 *
 * AUTH: the vault's gateway key travels as `cf-aig-authorization` (an
 * authenticated gateway); provider keys live in the gateway (BYOK), never here.
 *
 * DISPATCH ACCOUNTING: every refusal that provably happens before a byte is
 * sent throws `PreDispatchError`, which releases the reservation; anything
 * after `fetch` is called — a network error, a non-2xx, an unparseable body —
 * is a normal error, which the gateway SETTLES (F3, R7-04).
 *
 * OUTPUT: the first choice's message content, parsed as a JSON object. A
 * provider reply that is not a JSON object is an error; schema validation and
 * the secret check stay in `llm()`.
 *
 * NOT VERIFIED HERE, stated: the live round trip (AC1-live) needs a provisioned
 * gateway and key (H2); these tests drive the adapter against a stubbed fetch. */
import { PreDispatchError, type GatewayTransport } from "./gateway.ts";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal | undefined }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

export class GatewayHttpError extends Error {}

export interface GatewayHttpOptions {
  /** The same AI Gateway base `llm()` is given — must end with "/". */
  readonly gatewayBaseUrl: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
}

export class AiGatewayHttpTransport implements GatewayTransport {
  readonly #base: URL;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;

  constructor(opts: GatewayHttpOptions) {
    let base: URL;
    try {
      base = new URL(opts.gatewayBaseUrl);
    } catch {
      throw new GatewayHttpError("gatewayBaseUrl is not a URL");
    }
    if (base.protocol !== "https:") throw new GatewayHttpError("the AI Gateway is reached over https only");
    if (!base.pathname.endsWith("/")) throw new GatewayHttpError("gatewayBaseUrl must end with '/'");
    const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (typeof f !== "function") throw new GatewayHttpError("no fetch implementation on this runtime");
    this.#base = base;
    this.#fetch = f;
    this.#timeoutMs = opts.timeoutMs ?? 30_000;
    Object.freeze(this);
  }

  async post(url: string, body: unknown, headers: Readonly<Record<string, string>>): Promise<unknown> {
    // ---- everything up to fetch() is provably pre-dispatch ----
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new PreDispatchError("transport refused a URL that does not parse — nothing was sent");
    }
    if (target.origin !== this.#base.origin || !target.pathname.startsWith(this.#base.pathname)) {
      throw new PreDispatchError("transport refused a URL outside its AI Gateway — nothing was sent");
    }
    const route = decodeURIComponent(target.pathname.slice(this.#base.pathname.length));
    if (!/^[a-z0-9-]+\/[\w.@/-]+$/i.test(route)) throw new PreDispatchError("transport could not read a model route from the URL — nothing was sent");
    const auth = headers["authorization"];
    if (typeof auth !== "string" || !/^Bearer \S+$/.test(auth)) throw new PreDispatchError("transport has no gateway credential — nothing was sent");
    const b = body as { role?: unknown; input?: unknown; contextBudgetTokens?: unknown };
    if (typeof b?.role !== "string") throw new PreDispatchError("transport body has no role — nothing was sent");
    const payload = JSON.stringify({
      model: route,
      max_tokens: typeof b.contextBudgetTokens === "number" && b.contextBudgetTokens > 0 ? Math.floor(b.contextBudgetTokens) : undefined,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You perform the "${b.role}" role. Reply with exactly one JSON object and nothing else.` },
        { role: "user", content: JSON.stringify(b.input ?? null) },
      ],
    });
    const endpoint = new URL("compat/chat/completions", this.#base).toString();
    const forward: Record<string, string> = { "content-type": "application/json", "cf-aig-authorization": auth };
    const client = headers["x-fullburn-client"];
    if (typeof client === "string") forward["cf-aig-metadata"] = JSON.stringify({ client });

    // ---- from here on, bytes may have left: errors are settled, not released ----
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.#timeoutMs) : null;
    let status: number;
    let text: string;
    try {
      const res = await this.#fetch(endpoint, { method: "POST", headers: forward, body: payload, signal: controller?.signal });
      status = res.status;
      text = await res.text();
    } catch {
      throw new GatewayHttpError("AI Gateway request failed after dispatch (network or timeout)");
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (status < 200 || status > 299) {
      // The body may echo request material; only the status crosses.
      throw new GatewayHttpError(`AI Gateway returned HTTP ${status}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GatewayHttpError("AI Gateway reply is not JSON");
    }
    const content = (parsed as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new GatewayHttpError("AI Gateway reply has no message content");
    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new GatewayHttpError("model reply is not JSON");
    }
    if (typeof output !== "object" || output === null || Array.isArray(output)) {
      throw new GatewayHttpError("model reply is not a JSON object");
    }
    return output;
  }
}
