import type { GatewayTransport } from "./gateway.ts";

/** WHICH TRANSPORTS NEVER LEAVE THE PROCESS (cross-family findings X2-09,
 * X3-14).
 *
 * An eval candidate's binding map is servable only through recorded outputs,
 * so the gateway must tell a genuine `RecordedTransport` from any object with
 * a `post()`. The X2-09 version exported a one-shot REGISTRAR the eval harness
 * claimed at load; the gateway never imported the harness, so a caller that
 * imported only the gateway could claim it first, brand a live transport and
 * serve an unevaluated candidate with no refusal anywhere (X3-14, 2026-10-04).
 * Now there is no registrar to claim: the class is defined HERE, beside a
 * module-private WeakSet that only its constructor writes. Final, frozen
 * instance, frozen prototype. */
const RECORDED = new WeakSet<object>();

export class RecordedTransport implements GatewayTransport {
  #outputs: Readonly<Record<string, unknown>>;
  #currentCase: string | null = null;

  constructor(outputs: Readonly<Record<string, unknown>>) {
    // FINAL: a subclass could override `post()` with a live call and still
    // carry the brand. Only this exact class is branded.
    if (new.target !== RecordedTransport) throw new TypeError("RecordedTransport is final — a subclass could carry the recorded brand to a live post()");
    this.#outputs = outputs;
    RECORDED.add(this);
    Object.freeze(this);
  }

  setCase(id: string): void {
    this.#currentCase = id;
  }

  async post(): Promise<unknown> {
    if (this.#currentCase === null) throw new TypeError("no golden case selected");
    // Own-property lookup (adversary finding R2-24): a polluted prototype must
    // not supply a recording for a case the candidate never answered.
    const out = Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined;
    if (out === undefined) throw new TypeError(`no recorded output for case "${this.#currentCase}"`);
    return out;
  }
}
Object.freeze(RecordedTransport.prototype);

export function isRecordedTransport(t: unknown): boolean {
  return typeof t === "object" && t !== null && RECORDED.has(t);
}
