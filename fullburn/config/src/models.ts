import { deepFreeze } from "./freeze.ts";

/** Model abstraction layer (ENGINE_BUILD.md §2.4). Roles are permanent; models
 * are config. Bindings change only through bindRole(), which is eval-gated and
 * family-diversity-checked (Law 13, adversary findings R6/R9a). */

export type ModelFamily =
  | "claude" | "gpt" | "gemini"
  | "llama" | "mistral" | "qwen" | "deepseek";

export interface ModelSpec {
  readonly id: string;
  readonly family: ModelFamily;
  /** Path under the AI Gateway base URL. Models are reachable ONLY through the
   * Gateway (Law 11); provider hostnames anywhere in the engine fail the
   * structural scan (adversary finding R4). */
  readonly gatewayRoute: string;
}

/** Minimal deterministic JSON-schema subset used to validate all agent output
 * (§2.4 structured I/O everywhere). */
export interface OutputSchema {
  readonly type: "object";
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, { readonly type: "string" | "number" | "boolean" | "array" }>>;
}

export interface RoleCard {
  readonly role: string;
  readonly domain: string;
  readonly side: "builder" | "adversary" | "neutral";
  readonly task: string;
  readonly contextBudgetTokens: number;
  readonly latencyBudgetMs: number;
  readonly costBudgetUsdPerCall: number;
  readonly outputSchema: OutputSchema;
  /** Golden eval set ref (evals/<role>/) and the threshold a candidate model
   * must meet. Scores are COMPUTED by the eval harness from recorded model
   * outputs — never loaded pre-computed (R6). */
  readonly goldenSet: string;
  readonly evalThreshold: number;
}

export const MODELS: Readonly<Record<string, ModelSpec>> = deepFreeze({
  "claude-sonnet": { id: "claude-sonnet", family: "claude", gatewayRoute: "anthropic/claude-sonnet" },
  "gpt-5": { id: "gpt-5", family: "gpt", gatewayRoute: "openai/gpt-5" },
  "qwen-72b": { id: "qwen-72b", family: "qwen", gatewayRoute: "workers-ai/qwen-72b" },
  "llama-70b": { id: "llama-70b", family: "llama", gatewayRoute: "workers-ai/llama-70b" },
});

export const ROLE_CARDS: Readonly<Record<string, RoleCard>> = deepFreeze({
  "hello-world": {
    role: "hello-world",
    domain: "foundation",
    side: "neutral",
    task: "Phase 0 AC 1: round-trip a trivial prompt through AI Gateway with a Langfuse trace.",
    contextBudgetTokens: 1_000,
    latencyBudgetMs: 10_000,
    costBudgetUsdPerCall: 0.01,
    outputSchema: { type: "object", required: ["greeting"], properties: { greeting: { type: "string" } } },
    goldenSet: "evals/hello-world",
    evalThreshold: 1.0,
  },
  "genome-tagger": {
    role: "genome-tagger",
    domain: "creative",
    side: "builder",
    task: "Tag an ad with hook type, angle, emotion, format, offer (§3 creative_genome).",
    contextBudgetTokens: 8_000,
    latencyBudgetMs: 20_000,
    costBudgetUsdPerCall: 0.02,
    outputSchema: {
      type: "object",
      required: ["hook", "angle", "emotion", "format", "offer"],
      properties: {
        hook: { type: "string" }, angle: { type: "string" }, emotion: { type: "string" },
        format: { type: "string" }, offer: { type: "string" },
      },
    },
    goldenSet: "evals/genome-tagger",
    evalThreshold: 0.8,
  },
  "creative-decision-adversary": {
    role: "creative-decision-adversary",
    domain: "creative",
    side: "adversary",
    task: "Attack kill/promote proposals in the creative domain before any write (§5.2).",
    contextBudgetTokens: 16_000,
    latencyBudgetMs: 30_000,
    costBudgetUsdPerCall: 0.05,
    outputSchema: { type: "object", required: ["verdict", "reasons"], properties: { verdict: { type: "string" }, reasons: { type: "array" } } },
    goldenSet: "evals/creative-decision-adversary",
    evalThreshold: 0.9,
  },
});

export type RoleBindings = Readonly<Record<string, string>>;

/** Launch bindings. Grunt work → open models; judgment → frontier (§2.4 cost
 * routing). Builder/adversary in the same domain on DIFFERENT families. */
export const ROLE_BINDINGS: RoleBindings = deepFreeze({
  "hello-world": "claude-sonnet",
  "genome-tagger": "qwen-72b",
  "creative-decision-adversary": "claude-sonnet",
});

/** WHERE A BINDING MAP CAME FROM (cross-family finding X2-09, 2026-09-24).
 * `llm()` validated a map's SHAPE — complete, known models, family diversity —
 * but any caller-built map passed, so an unevaluated model could be served
 * with no eval having run: "no pass, no bind" held for `bindRole` and not for
 * serving. Identity now carries provenance: the launch table and every map
 * `bindRole` returns are SERVABLE; an eval run's candidate map is a CANDIDATE,
 * servable only through recorded outputs. A spread copy is neither. */
const SERVABLE = new WeakSet<object>([ROLE_BINDINGS]);
const CANDIDATE = new WeakSet<object>();

export type BindingProvenance = "servable" | "candidate" | null;
export function bindingsProvenance(bindings: unknown): BindingProvenance {
  if (typeof bindings !== "object" || bindings === null) return null;
  if (SERVABLE.has(bindings)) return "servable";
  if (CANDIDATE.has(bindings)) return "candidate";
  return null;
}

/** The map an eval run serves under: the launch table with one role swapped
 * to the candidate. Validated like any other map — a candidate that would break
 * family diversity cannot even be evaluated — and marked CANDIDATE, which the
 * gateway serves only through recorded outputs. */
export function evalCandidateBindings(role: string, modelId: string): RoleBindings {
  const next = deepFreeze({ ...ROLE_BINDINGS, [role]: modelId });
  validateBindings(next);
  CANDIDATE.add(next);
  return next;
}

export class BindingError extends Error {}

/** Own-property lookup: inherited/polluted prototype entries never resolve. */
export function ownEntry<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The ids of every case in a role's golden set. Declared HERE, next to the
 * role card, so the harness cannot be pointed at a friendlier set and a
 * fabricated run cannot invent its own coverage (adversary finding R2-23). */
export const GOLDEN_SET_CASE_IDS: Readonly<Record<string, readonly string[]>> = deepFreeze({
  "hello-world": ["h1"],
  "genome-tagger": ["g1", "g2", "g3", "g4", "g5"],
  "creative-decision-adversary": ["a1", "a2", "a3"],
});

/** Per-case outcome from an executed eval run. */
export interface EvalCaseOutcome {
  readonly caseId: string;
  readonly passed: boolean;
}

/** Evidence that the eval harness actually executed a role's golden set against
 * a candidate model (F9; hardened per R2-22).
 *
 * This is a branded class, not a plain shape: the only way to obtain one is
 * `attestEvalRun`, which requires per-case outcomes covering EXACTLY the role's
 * declared golden set and computes the score itself. A hand-written literal —
 * even one whose arithmetic closes — is not an instance and does not bind.
 *
 * Honest limit: within one process, any module that can import `attestEvalRun`
 * can call it. What this removes is the ability to assert a pass without
 * producing a full, correctly-shaped run for the real case ids; it is not
 * cryptographic provenance. Ledger item L12 records that gap. */
export class EvalAttestation {
  readonly role: string;
  readonly modelId: string;
  readonly score: number;
  readonly total: number;
  readonly passed: number;
  readonly outcomes: readonly EvalCaseOutcome[];

  /** @internal — constructed only via attestEvalRun. */
  constructor(brand: symbol, role: string, modelId: string, outcomes: readonly EvalCaseOutcome[]) {
    if (brand !== ATTESTATION_BRAND) {
      throw new BindingError("EvalAttestation is not directly constructible — it must come from an executed eval run");
    }
    this.role = role;
    this.modelId = modelId;
    this.outcomes = Object.freeze([...outcomes]);
    this.total = outcomes.length;
    this.passed = outcomes.filter((o) => o.passed).length;
    this.score = this.passed / this.total;
    Object.freeze(this);
  }
}

const ATTESTATION_BRAND = Symbol("fullburn.eval-attestation");
const GENUINE = new WeakSet<EvalAttestation>();

/** A role's golden set, or a refusal. EXPORTED SO THE GUARD CAN BE DRIVEN
 * (cross-family finding X5-13, 2026-10-06): every role in the registry
 * declares a set, so through `attestEvalRun` this branch has no violating
 * input, and its mutation was "caught" only because the sweep's source scan
 * lost a throw. Driving it directly makes the catch behavioural. */
export function requireGoldenSet(role: string, declared: readonly string[] | undefined): readonly string[] {
  if (declared === undefined || declared.length === 0) {
    throw new BindingError(`role "${role}" declares no golden set — an eval over nothing proves nothing`);
  }
  return declared;
}

/** The one factory. Verifies the run covers exactly the role's declared golden
 * set — no substituted set, no partial run, no duplicated case padding a score. */
export function attestEvalRun(role: string, modelId: string, outcomes: readonly EvalCaseOutcome[]): EvalAttestation {
  const card = ownEntry(ROLE_CARDS, role);
  if (card === undefined) throw new BindingError(`attestEvalRun: unknown role "${role}"`);
  if (ownEntry(MODELS, modelId) === undefined) throw new BindingError(`attestEvalRun: unknown model "${modelId}"`);
  const declared = requireGoldenSet(role, ownEntry(GOLDEN_SET_CASE_IDS, role));
  if (!Array.isArray(outcomes)) throw new BindingError("eval outcomes must be an array");
  const seen = outcomes.map((o) => o?.caseId);
  if (new Set(seen).size !== seen.length) throw new BindingError("eval run repeats a case id");
  const expected = [...declared].sort();
  const actual = [...seen].sort();
  if (expected.length !== actual.length || expected.some((id, i) => id !== actual[i])) {
    throw new BindingError(
      `eval run does not cover role "${role}"'s declared golden set (expected ${expected.join(",")}; got ${actual.join(",")})`,
    );
  }
  for (const o of outcomes) {
    if (typeof o.passed !== "boolean") throw new BindingError("eval outcome must record a boolean pass/fail per case");
  }
  const att = new EvalAttestation(ATTESTATION_BRAND, role, modelId, outcomes);
  GENUINE.add(att);
  return att;
}

/** Only an object minted by attestEvalRun binds. */
function assertAttestation(att: unknown, role: string, modelId: string): asserts att is EvalAttestation {
  if (!(att instanceof EvalAttestation) || !GENUINE.has(att)) {
    throw new BindingError(
      `bindRole requires an attestation from an executed eval run for "${role}" — a literal is not evidence an eval ran (§2.4, Law 13)`,
    );
  }
  if (att.role !== role) throw new BindingError(`eval result is for role "${att.role}", not "${role}"`);
  if (att.modelId !== modelId) throw new BindingError(`eval result is for model "${att.modelId}", not "${modelId}"`);
}

/** Exported so its no-binding guard can be driven (X5-13): every caller
 * passes a role taken from the bindings' own keys. */
export function familyOf(bindings: RoleBindings, role: string): ModelFamily {
  const modelId = ownEntry(bindings, role);
  if (modelId === undefined) throw new BindingError(`role "${role}" has no binding`);
  const spec = ownEntry(MODELS, modelId);
  if (spec === undefined) throw new BindingError(`binding for "${role}" names unknown model "${modelId}"`);
  return spec.family;
}

/** Law 13 / §2.4: for every domain, builder-side and adversary-side roles must
 * run on different model families. Checked across ALL bindings, not on demand
 * (R9a) — and the check is only meaningful if both sides are actually present,
 * so completeness is enforced first (adversary finding F11): dropping the
 * adversary binding must not be a way to satisfy the rule vacuously. */
export function validateBindings(bindings: RoleBindings, cards: Readonly<Record<string, RoleCard>> = ROLE_CARDS): void {
  // Completeness: every declared role holds a binding.
  for (const role of Object.keys(cards)) {
    if (ownEntry(bindings, role) === undefined) {
      throw new BindingError(`role "${role}" is declared but unbound — every role card must hold a binding (Law 13)`);
    }
  }

  const byDomain = new Map<string, { builders: string[]; adversaries: string[] }>();
  for (const role of Object.keys(bindings)) {
    const card = ownEntry(cards, role);
    if (card === undefined) throw new BindingError(`binding exists for unknown role "${role}"`);
    familyOf(bindings, role); // validates model exists
    const entry = byDomain.get(card.domain) ?? { builders: [], adversaries: [] };
    if (card.side === "builder") entry.builders.push(role);
    if (card.side === "adversary") entry.adversaries.push(role);
    byDomain.set(card.domain, entry);
  }

  // Pairing: a domain that builds must also be attacked, or "different families"
  // is a statement about an empty set.
  for (const [domain, { builders, adversaries }] of byDomain) {
    if (builders.length > 0 && adversaries.length === 0) {
      throw new BindingError(
        `domain "${domain}" binds a builder with no adversary — family diversity would be vacuous (Law 13, §2.4)`,
      );
    }
  }

  for (const [domain, { builders, adversaries }] of byDomain) {
    for (const b of builders) {
      for (const a of adversaries) {
        if (familyOf(bindings, b) === familyOf(bindings, a)) {
          throw new BindingError(
            `family-diversity violation in domain "${domain}": builder "${b}" and adversary "${a}" share family "${familyOf(bindings, b)}" (Law 13)`,
          );
        }
      }
    }
  }
}

/** Eval-gated rebind (§2.4): returns NEW bindings; never mutates. The evidence
 * must be the eval harness's own result for exactly this (role, model), with
 * arithmetic that closes — a caller-chosen number binds nothing (F9). */
export function bindRole(
  bindings: RoleBindings,
  role: string,
  modelId: string,
  evalResult: EvalAttestation,
): RoleBindings {
  /** THE INPUT MAP MUST ITSELF BE EARNED (cross-family finding X3-10,
   * 2026-10-04): bindRole checked evidence only for the role it changed and
   * marked the WHOLE result servable, so a hand-built base with an unevaluated
   * model in another role came out laundered. And it took caller-supplied role
   * cards, so the caller chose the threshold. Both are gone: the base must be
   * servable, and the threshold is the registry's. */
  if (bindingsProvenance(bindings) !== "servable") {
    throw new BindingError("bindRole: the base binding map has no serving provenance — an unevaluated base cannot be laundered through one attested role (§2.4)");
  }
  const cards = ROLE_CARDS;
  const card = ownEntry(cards, role);
  if (card === undefined) throw new BindingError(`bindRole: unknown role "${role}"`);
  if (ownEntry(MODELS, modelId) === undefined) throw new BindingError(`bindRole: unknown model "${modelId}"`);
  assertAttestation(evalResult, role, modelId);
  if (evalResult.score < card.evalThreshold) {
    throw new BindingError(
      `model "${modelId}" scored ${evalResult.score} < threshold ${card.evalThreshold} for role "${role}" — no pass, no bind`,
    );
  }
  const next = deepFreeze({ ...bindings, [role]: modelId });
  validateBindings(next, cards);
  SERVABLE.add(next);
  return next;
}

// Launch bindings must themselves satisfy the diversity rule at import time.
validateBindings(ROLE_BINDINGS);
