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

export class BindingError extends Error {}

/** Own-property lookup: inherited/polluted prototype entries never resolve. */
export function ownEntry<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Evidence that the eval harness actually executed a role's golden set against
 * a candidate model (adversary finding F9). `bindRole` takes this, not a bare
 * number: a caller-chosen score is not proof an eval ran, and Law 4 says gates
 * are code, not convention. The engine's `EvalResult` satisfies this shape
 * structurally, so the harness output is passed straight through. */
export interface EvalAttestation {
  readonly role: string;
  readonly modelId: string;
  readonly score: number;
  readonly total: number;
  readonly passed: number;
}

/** Validates that an attestation could only have come from a real harness run
 * for exactly this (role, model): the arithmetic must close. */
function assertAttestation(att: unknown, role: string, modelId: string): asserts att is EvalAttestation {
  if (att === null || typeof att !== "object") {
    throw new BindingError(
      `bindRole requires the eval harness result for "${role}" — a bare score is not evidence an eval ran (§2.4, Law 13)`,
    );
  }
  const a = att as Partial<EvalAttestation>;
  if (a.role !== role) throw new BindingError(`eval result is for role "${String(a.role)}", not "${role}"`);
  if (a.modelId !== modelId) throw new BindingError(`eval result is for model "${String(a.modelId)}", not "${modelId}"`);
  if (typeof a.total !== "number" || !Number.isInteger(a.total) || a.total <= 0) {
    throw new BindingError("eval result must cover a non-empty golden set — an eval over nothing proves nothing");
  }
  if (typeof a.passed !== "number" || !Number.isInteger(a.passed) || a.passed < 0 || a.passed > a.total) {
    throw new BindingError("eval result passed-count is not a valid fraction of the golden set");
  }
  if (typeof a.score !== "number" || !Number.isFinite(a.score) || a.score < 0 || a.score > 1) {
    throw new BindingError("eval score must be a finite number in [0,1] — the harness cannot return anything else");
  }
  // The score must be the arithmetic the harness would have produced.
  if (Math.abs(a.score - a.passed / a.total) > 1e-9) {
    throw new BindingError(
      `eval score ${a.score} does not match ${a.passed}/${a.total} — the result was not produced by the harness`,
    );
  }
}

function familyOf(bindings: RoleBindings, role: string): ModelFamily {
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
  cards: Readonly<Record<string, RoleCard>> = ROLE_CARDS,
): RoleBindings {
  const card = ownEntry(cards, role);
  if (card === undefined) throw new BindingError(`unknown role "${role}"`);
  if (ownEntry(MODELS, modelId) === undefined) throw new BindingError(`unknown model "${modelId}"`);
  assertAttestation(evalResult, role, modelId);
  if (evalResult.score < card.evalThreshold) {
    throw new BindingError(
      `model "${modelId}" scored ${evalResult.score} < threshold ${card.evalThreshold} for role "${role}" — no pass, no bind`,
    );
  }
  const next = deepFreeze({ ...bindings, [role]: modelId });
  validateBindings(next, cards);
  return next;
}

// Launch bindings must themselves satisfy the diversity rule at import time.
validateBindings(ROLE_BINDINGS);
