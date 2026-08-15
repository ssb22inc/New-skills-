/** Scan rules for the leak + structural check (§10.2, §15; R4).
 *
 * Split out of leak-check.mjs so the rules are unit-testable without running a
 * filesystem walk or calling process.exit inside a test worker (adversary
 * finding F18). The CLI lives in leak-check.mjs and imports this.
 *
 * Two rule families:
 *  - SECRET rules run against every scanned file, including docs. A token in a
 *    report or a fixture is still a token.
 *  - STRUCTURAL rules run against code only (.ts/.tsx/.mjs/.js). They encode
 *    absence claims — "no such code path exists" — which is why several §10.2
 *    invariants can be armed now, before the code they forbid is ever written
 *    (adversary spec observation #3). Prose that discusses a banned pattern is
 *    not a violation of it. */

export const SECRET_PATTERNS = [
  { name: "anthropic key", re: /sk-ant-[A-Za-z0-9-_]{8,}/ },
  { name: "stripe/openai key", re: /sk-(?:live|test|proj)-[A-Za-z0-9-_]{8,}/ },
  { name: "openai project key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "stripe webhook secret", re: /whsec_[A-Za-z0-9]{8,}/ },
  { name: "aws access key id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // Crown jewels this product actually holds (§15; adversary finding F16):
  { name: "meta/facebook access token", re: /\bEAA[A-Za-z0-9]{20,}/ },
  { name: "google oauth access token", re: /\bya29\.[A-Za-z0-9._-]{10,}/ },
  { name: "google api key", re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: "slack bot token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "generic bearer literal", re: /Bearer\s+[A-Za-z0-9._-]{24,}/ },
];

/** LLM providers must be reachable only through AI Gateway (Law 11). */
export const PROVIDER_HOSTS =
  /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|api\.mistral\.ai|api\.groq\.com|api\.together\.xyz|api\.fireworks\.ai|openrouter\.ai/;

/** Static, dynamic and CJS forms all bypass the gateway equally (F16). */
export const PROVIDER_SDKS =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/|openai|@google\/generative|@mistralai\/|groq-sdk|together-ai)/;

/** Law 1: reads come from the warehouse. Platform API hosts have no business in
 * engine code; the Phase 6 write adapter will be an explicit allowlist entry. */
export const PLATFORM_API_HOSTS =
  /graph\.facebook\.com|googleads\.googleapis\.com|business-api\.tiktok\.com|ads-api\.tiktok\.com/;

/** Law 6: no model may block or greenlight creative on predicted performance.
 * Armed now, while it is trivially true. */
export const PREDICTION_GATE_IDENTIFIERS =
  /\b(?:predictedPerformance|predictWinner|predictedCtr|predicted_ctr|winProbability|predictedRoas|forecastWinner|scoreCreativeForLaunch)\b/;

export const MODEL_IDS = /["'](?:claude-sonnet|gpt-5|qwen-72b|llama-70b)["']/;

/** Law 18: staged/locked flags must be read through the accessors, never by
 * indexing the registry directly (adversary finding F19). */
export const REGISTRY_INDEXING = /\b(?:MARKETS|CHANNELS)\s*\[/;

const CODE_FILE = /\.(?:ts|tsx|mjs|js)$/;
/** Tests and recorded fixtures must be able to contain the very strings these
 * rules ban — that is how the rules themselves get verified. SECRET rules still
 * apply to them: a real token in a test is still a leak. */
const TEST_OR_FIXTURE = [/\/test\//, /\.test\.ts$/, /engine\/evals\//];
const SCANNER_SELF = /engine\/scripts\/scan-lib\.mjs$/;
const STRUCTURAL_EXEMPT = [SCANNER_SELF, ...TEST_OR_FIXTURE];
const MODEL_ID_ALLOWLIST = [/config\/src\/models\.ts$/, ...STRUCTURAL_EXEMPT];
const REGISTRY_ALLOWLIST = [/config\/src\/markets\.ts$/, /config\/src\/channels\.ts$/, ...STRUCTURAL_EXEMPT];

/** Returns a list of finding strings; empty means clean. */
export function scanContent(path, content) {
  const findings = [];

  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) findings.push(`${path}: possible ${name} (§10.2 — tokens live only in the vault)`);
  }

  // Structural rules are claims about CODE, not about prose describing code,
  // and not about the tests that verify the rules.
  if (!CODE_FILE.test(path) || STRUCTURAL_EXEMPT.some((a) => a.test(path))) return findings;

  if (PROVIDER_HOSTS.test(content)) {
    findings.push(`${path}: LLM provider hostname — all LLM traffic goes through AI Gateway (Law 11)`);
  }
  if (PROVIDER_SDKS.test(content)) {
    findings.push(`${path}: provider SDK import — gateway.ts is the only LLM call path (Law 11)`);
  }
  if (PLATFORM_API_HOSTS.test(content)) {
    findings.push(`${path}: platform API hostname — reads come from the warehouse; writes go through the phase-gated adapter (Law 1)`);
  }
  if (PREDICTION_GATE_IDENTIFIERS.test(content)) {
    findings.push(`${path}: prediction-gate identifier — the market picks winners, no model may gate creative on predicted performance (Law 6)`);
  }
  if (MODEL_IDS.test(content) && !MODEL_ID_ALLOWLIST.some((a) => a.test(path))) {
    findings.push(`${path}: raw model id outside config/evals/tests — engine code must be model-agnostic (§2.4)`);
  }
  if (REGISTRY_INDEXING.test(content) && !REGISTRY_ALLOWLIST.some((a) => a.test(path))) {
    findings.push(`${path}: direct market/channel registry indexing — use requireActiveMarket/requireActiveChannel so staged and locked flags stay inert (Law 18)`);
  }

  return findings;
}
