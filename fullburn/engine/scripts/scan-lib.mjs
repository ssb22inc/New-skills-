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
  // Requires an actual key body, not just the header: reports and runbooks
  // legitimately quote the header when describing what this rule catches.
  // Armor lines (Proc-Type, DEK-Info, Comment, Bag Attributes) sit between the
  // header and the body, and a 16-column wrap breaks a 40-char run — both
  // pushed a REAL key past the old window (adversary finding B2). Match a
  // header followed by enough base64 anywhere in the block instead.
  { name: "private key block", re: /-----BEGIN (?:[A-Z0-9 ]*)PRIVATE KEY(?: BLOCK)?-----[\s\S]{0,600}?(?:[A-Za-z0-9+/=]{16,}[\r\n\s]*){3,}/ },
  // Crown jewels this product actually holds (§15; adversary finding F16):
  { name: "meta/facebook access token", re: /\bEAA[A-Za-z0-9]{20,}/ },
  { name: "google oauth access token", re: /\bya29\.[A-Za-z0-9._-]{10,}/ },
  { name: "google api key", re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: "slack bot token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "generic bearer literal", re: /Bearer\s+[A-Za-z0-9._-]{24,}/ },
];

/** LLM providers must be reachable only through AI Gateway (Law 11).
 * Matched on the DOMAIN, not the full hostname (adversary finding R2-13): a
 * literal-string grep for `api.openai.com` misses `"api." + "openai.com"`,
 * `https://${host}/v1`, and every subdomain variant. */
export const PROVIDER_HOSTS =
  /openai\.com|anthropic\.com|generativelanguage\.googleapis|mistral\.ai|api\.groq\.com|together\.xyz|fireworks\.ai|openrouter\.ai/;

/** Static, dynamic and CJS forms all bypass the gateway equally (F16). */
export const PROVIDER_SDKS =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)\s*["'`](?:@anthropic-ai\/|openai|@google\/generative|@mistralai\/|groq-sdk|together-ai)/;

/** Law 1: reads come from the warehouse. Platform API hosts have no business in
 * engine code; the Phase 6 write adapter will be an explicit allowlist entry.
 * Domain-level for the same reason as PROVIDER_HOSTS (R2-13). */
export const PLATFORM_API_HOSTS =
  /graph\.facebook\.com|facebook\.com\/v\d|googleads\.googleapis|business-api\.tiktok|ads-api\.tiktok|ads\.tiktok\.com/;

/** Law 6: no model may block or greenlight creative on predicted performance.
 * Stem-based rather than an enumeration of exact spellings (R2-13): any
 * identifier built from predict/forecast/projected + a performance noun. */
export const PREDICTION_GATE_IDENTIFIERS = new RegExp(
  [
    // A prediction becomes a GATE only where it decides whether creative ships.
    // Naming alone is not the offence: `expectedRevenue` vs `actualRevenue` is
    // the reconciliation pairing Law 10 requires, and the counterfactual ledger
    // is literally projected spend (adversary finding C3). Match the DECISION.
    "\\b(?:predict|forecast|projected|expected|estimated)[A-Za-z_]*(?:Performance|Ctr|CTR|Roas|ROAS|Winner|Probability)\\b",
    "\\b(?:win|success)Probability\\b",
    "\\bscoreCreativeForLaunch\\b",
    // …and any predicted quantity used as a launch/kill condition.
    "(?:predicted|forecast|projected|estimated)[A-Za-z_]*\\s*[<>]=?[^;\\n]{0,40}(?:return|continue|skip|veto|reject|block|kill|drop)",
    "(?:if|while)\\s*\\([^)]*(?:predicted|forecastScore|projectedScore)[A-Za-z_]*[^)]*\\)\\s*\\{?\\s*(?:return|veto|reject|block|kill|skip)",
  ].join("|"),
);

export const MODEL_IDS = /["'](?:claude-sonnet|gpt-5|qwen-72b|llama-70b)["']/;

/** Law 18: staged/locked flags must be read through the accessors, never by
 * indexing the registry directly (adversary finding F19). */
export const REGISTRY_INDEXING =
  /\b(?:MARKETS|CHANNELS)\s*\[|\b(?:MARKETS|CHANNELS)\s*\.\s*[A-Za-z_$]|\{[^}]*\}\s*=\s*(?:MARKETS|CHANNELS)\b|Object\s*\.\s*(?:values|entries|keys|assign|freeze|getOwnPropertyNames)\s*\(\s*(?:MARKETS|CHANNELS)\b|\b(?:MARKETS|CHANNELS)\s+as\s+[A-Za-z_$]/;

/** Kept deliberately in step with leak-check's SCANNED list (adversary finding
 * B1): .cjs and .jsx were READ but got zero structural checking, and .mts/.cts
 * were not read at all — a module could carry a provider hostname past every
 * rule by choosing its extension. */
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
/** Tests and recorded fixtures must be able to contain the very strings these
 * rules ban — that is how the rules themselves get verified. SECRET rules still
 * apply to them: a real token in a test is still a leak.
 *
 * ANCHORED to the two real test roots (adversary finding R2-15): a bare
 * `/test/` segment also exempted any production directory that happened to
 * contain one — `engine/src/ab-test/`, `config/src/test/` — so shipping code
 * could sit inside the exemption. */
const TEST_OR_FIXTURE = [
  /^fullburn\/(?:config|engine)\/test\//,
  /^fullburn\/(?:config|engine)\/[^/]*\.test\.ts$/,
  // engine/evals is NOT here (adversary finding B4): it held a blanket
  // exemption from all five structural rules while containing nothing that
  // needed one. Recorded outputs are data; if a fixture ever needs to carry a
  // banned string, it belongs in a test file where the exemption is earned.
];
const SCANNER_SELF = /engine\/scripts\/scan-lib\.mjs$/;
/** Where Fullburn's Laws apply. Secret rules apply everywhere. */
const STRUCTURAL_SCOPE = /^(?:fullburn|\.github)\//;
const STRUCTURAL_EXEMPT = [SCANNER_SELF, ...TEST_OR_FIXTURE];
const MODEL_ID_ALLOWLIST = [/config\/src\/models\.ts$/, ...STRUCTURAL_EXEMPT];
const REGISTRY_ALLOWLIST = [/config\/src\/markets\.ts$/, /config\/src\/channels\.ts$/, ...STRUCTURAL_EXEMPT];

/** Values that LOOK like secrets and provably are not: declared test fixtures.
 * Narrow by construction — exact strings only, no patterns. The canary exists
 * to prove secrets do not escape, so it turns up in evidence and reports; if it
 * were treated as a live secret the scanner would cry wolf on its own proof. */
export const DECLARED_FIXTURES = [
  "canary-vault-value-do-not-leak-8891",
  // Placeholder the r3 adversary planted in a synthetic repo to prove the
  // scanner fires, then quoted in its own evidence. Reports are append-only, so
  // the quote cannot be edited out; declaring the exact string keeps the rule
  // strong while stopping the scanner from failing CI on its own proof.
  "sk-" + "ant-" + "ABCDEFGH12345678",
];

/** Token-shaped strings quoted as EVIDENCE inside one specific append-only
 * report, excused only in that file.
 *
 * The r4 review proved the allowlist was a token splitter by executing three
 * evasions, and quoted them. Reports cannot be edited, so the proof stays in the
 * tree and the scanner correctly fires on it — a synthetic string shaped like a
 * live key is still shaped like a live key.
 *
 * These are NOT added to DECLARED_FIXTURES, and that distinction is the whole
 * point. One of the evasions is the declared fixture with sixteen more upper-case
 * characters appended — precisely the shape an AWS-key rule matches — so
 * declaring it globally would excuse that composition everywhere and reopen N-06
 * with the fix still in place. This project's own lock test caught exactly that
 * when it was tried. Scoping the excuse to the one file that has to carry the
 * proof keeps the rule strong everywhere the proof is not. */
// Assembled at runtime, never written as a literal: this file is scanned like
// any other, and a complete token here would be a finding in the scanner's own
// source. The test suite uses the same discipline.
const ANT = "sk-" + "ant-";
const QUOTED_EVIDENCE = new Map([
  [
    "fullburn/reports/ADVERSARY_REPORT_phase0.r4.md",
    [
      `${ANT}ABCDEFGH12345678ZZZZyyyyXXXXwwww9999`,
      `${ANT}api0${ANT}ABCDEFGH123456783-LIVEKEYMATERIAL1234567890`,
      `${ANT}ABCDEFGH12345678ABCDEFGHIJKLMNOP`,
    ],
  ],
]);

/** A declared fixture that CONTAINS another is a splitter by construction: the
 * longer one excuses a match the shorter one sits inside. Checked at import so
 * the next entry cannot quietly reintroduce N-06. */
for (const a of DECLARED_FIXTURES) {
  for (const b of DECLARED_FIXTURES) {
    if (a !== b && a.includes(b)) {
      throw new Error(`declared fixture "${a}" contains "${b}" — that is a token splitter, not an allowlist entry`);
    }
  }
}

/** The allowlist is an exception applied to a MATCH, never a substitution
 * applied to the text.
 *
 * Substituting first made the allowlist a token-splitter: `content.split(f)`
 * removed the declared string wherever it appeared, so splicing it into a live
 * token broke the pattern while the material stayed perfectly greppable —
 * `sk-ant-api0` + `sk-ant-ABCDEFGH12345678` + `3-LIVEKEYMATERIAL…` scanned
 * clean, as did an AWS key split the same way (adversary finding N-06). Worse,
 * a real key whose body merely BEGAN with a declared fixture became invisible.
 *
 * Matching first and excusing after inverts that: a span is excused only when
 * the span the rule actually matched IS a declared fixture, in full. A fixture
 * embedded in something longer no longer excuses the longer thing. */
function isDeclaredFixture(matched, path) {
  if (DECLARED_FIXTURES.includes(matched)) return true;
  if (QUOTED_EVIDENCE.get(path)?.includes(matched)) return true;
  // Some rules match a wrapper around the value (`Bearer <token>`), so the
  // matched span is legitimately longer than the declared string. Excuse those,
  // but ONLY when the declared fixture accounts for every token-bearing
  // character of the match: whatever is left over must be pure punctuation or
  // the literal word "Bearer". Any spliced-in key material leaves a residue and
  // the match stands — which is what makes this an exception rather than the
  // splitter N-06 exploited.
  let residue = matched;
  for (const f of DECLARED_FIXTURES) residue = residue.split(f).join("");
  return /^[^A-Za-z0-9]*(?:Bearer)?[^A-Za-z0-9]*$/i.test(residue);
}

/** Every match of `re` in `content` that is not itself a declared fixture. */
function realMatches(re, content, path) {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const out = [];
  for (const m of content.matchAll(global)) {
    if (!isDeclaredFixture(m[0], path)) out.push(m[0]);
  }
  return out;
}

/** Returns a list of finding strings; empty means clean. */
export function scanContent(path, content) {
  const findings = [];

  for (const { name, re } of SECRET_PATTERNS) {
    if (realMatches(re, content, path).length > 0) {
      findings.push(`${path}: possible ${name} (§10.2 — tokens live only in the vault)`);
    }
  }

  // Structural rules are claims about CODE, not about prose describing code,
  // and not about the tests that verify the rules. They are also claims about
  // FULLBURN's code: sibling projects in this repo are scanned for secrets
  // (a leaked token is a leak wherever it sits — adversary finding H-16) but
  // are not governed by Fullburn's Laws.
  if (!STRUCTURAL_SCOPE.test(path)) return findings;
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

/** ─── WHAT THE WALK LOOKS AT, AND WHAT THE CLI DOES WITH THE RESULT ────────
 *
 * These three decisions lived in `leak-check.mjs`, above and below its
 * entry-point guard, where nothing in the default suite could reach them. All
 * three were measured SURVIVING a one-line revert with `npm test` green at
 * 354/354 (runner audit against the R14-06 rule):
 *
 *   - narrowing `SCANNED` to `/\.(?:mjs)$/` — every TypeScript file, every
 *     report, every workflow silently stopped being scanned for tokens;
 *   - adding `src` and `scripts` to `SKIP_DIRS` — the engine's own source tree
 *     dropped out of the walk;
 *   - `if (findings.length > 0)` → `if (false)` — the CLI printed nothing and
 *     exited 0 with findings in hand. That is N-03 leg B, the CLI-wiring gap
 *     `gate-cli.test.ts` was built to close for the gates, still open on the
 *     leak scan because no test had ever executed this CLI.
 *
 * CAPABILITY REMOVED: the leak scan can no longer decide what to read or what
 * to report from inside a process the default suite never starts. The decisions
 * are here, driven directly by `scan-lib.test.ts`, and the CLI that consumes
 * them is executed end-to-end by `engine/test/integration/leak-cli.test.ts`. */

/** Directories never walked. A denylist: a directory nobody thought of falls
 * INTO the scan rather than out of it. */
export const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** WHAT IS NOT READ — a DENYLIST, for the same reason `SKIP_DIRS` is one.
 *
 * This was an ALLOWLIST of 24 extensions, and the file it lived in said, three
 * lines above it, that a directory nobody thought of must fall INTO the scan
 * rather than out of it. The same argument was never applied to file types.
 * Driving the decision against the tracked tree found eleven files the leak
 * scan had never read, including `haven/terraform/aws/variables.tf` and
 * `haven/Dockerfile.dev` — the two formats where a real credential is most
 * likely to be sitting in plain text (runner audit, R14-06 rule).
 *
 * So the polarity is inverted. Every file is read unless its bytes are binary
 * or its extension is named here, and each entry names why. A file type nobody
 * thought of is scanned. */
export const NOT_SCANNED_EXTENSIONS = Object.freeze({
  png: "binary raster image",
  jpg: "binary raster image",
  jpeg: "binary raster image",
  gif: "binary raster image",
  webp: "binary raster image",
  avif: "binary raster image",
  ico: "binary icon",
  woff: "binary font",
  woff2: "binary font",
  ttf: "binary font",
  otf: "binary font",
  eot: "binary font",
  pdf: "binary document",
  zip: "binary archive",
  gz: "binary archive",
  tgz: "binary archive",
  bz2: "binary archive",
  xz: "binary archive",
  wasm: "binary module",
  mp4: "binary video",
  webm: "binary video",
  mov: "binary video",
  mp3: "binary audio",
  wav: "binary audio",
});

/** Is this file read by the scan? Everything is, except the binary types above.
 * Extensionless files (`Dockerfile`, `Makefile`, `Procfile`) and dotfiles
 * (`.env`, `.gitignore`, `.nvmrc`) are read: all three are places a token is
 * pasted, and all three were outside the old allowlist. */
export function isScannedFile(name) {
  const dot = name.lastIndexOf(".");
  // A leading dot is the file's NAME, not an extension: `.env` is a dotfile.
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return !Object.hasOwn(NOT_SCANNED_EXTENSIONS, ext);
}

/** A NUL byte in the head of a file means it is not text, whatever it is
 * called. The extension denylist covers the formats we know; this covers the
 * ones we do not, so an unnamed binary type is skipped by MEASUREMENT rather
 * than by being absent from a list. */
export function looksBinary(bytes) {
  const head = bytes.subarray(0, Math.min(bytes.length, 8192));
  return head.includes(0);
}

export function isSkippedDir(name) {
  return SKIP_DIRS.has(name);
}

/** The CLI's verdict, as a value rather than as control flow — the same shape
 * `harnessVerdict` uses, and for the same reason. */
export function leakVerdict(findings) {
  if (!Array.isArray(findings)) {
    return { ok: false, reason: "LEAK/STRUCTURAL SCAN FAIL: the scan returned no result at all (fail closed)" };
  }
  if (findings.length === 0) return { ok: true, reason: "leak/structural scan: clean" };
  return {
    ok: false,
    reason: `LEAK/STRUCTURAL SCAN FAIL:\n${findings.map((f) => `  - ${f}`).join("\n")}`,
  };
}
