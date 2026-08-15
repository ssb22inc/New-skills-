#!/usr/bin/env node
/** Secret-leak scan (§10.2, §15; extended per R4 into a structural scan).
 * Fails on: secret-shaped strings anywhere in fullburn/; provider hostnames or
 * provider SDK imports outside the gateway/config layer (the gateway is the
 * ONLY LLM path); raw model-id literals outside config/evals/tests.
 * Usage: node leak-check.mjs <repo-root> */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.argv[2] ?? ".";
const scanRoot = join(repoRoot, "fullburn");

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9-_]{8,}/, // Anthropic
  /sk-(?:live|test|proj)-[A-Za-z0-9-_]{8,}/, // Stripe/OpenAI-style
  /whsec_[A-Za-z0-9]{8,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const PROVIDER_HOSTS = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|api\.mistral\.ai|api\.groq\.com|api\.together\.xyz|openrouter\.ai/;
const PROVIDER_SDKS = /from\s+["'](?:@anthropic-ai\/|openai|@google\/generative)/;
const MODEL_IDS = /["'](?:claude-sonnet|gpt-5|qwen-72b|llama-70b)["']/;
const MODEL_ID_ALLOWLIST = [/config\/src\/models\.ts$/, /engine\/evals\//, /\/test\//, /scripts\/leak-check\.mjs$/];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs|js|json|md|toml|ya?ml)$/.test(name)) yield p;
  }
}

export function scanContent(path, content) {
  const findings = [];
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(content)) findings.push(`${path}: secret-shaped string matching ${pat}`);
  }
  if (PROVIDER_HOSTS.test(content)) findings.push(`${path}: provider hostname — all LLM traffic goes through AI Gateway (Law 11)`);
  if (PROVIDER_SDKS.test(content)) findings.push(`${path}: provider SDK import — gateway.ts is the only call path`);
  if (MODEL_IDS.test(content) && !MODEL_ID_ALLOWLIST.some((a) => a.test(path))) {
    findings.push(`${path}: raw model id outside config/evals/tests — engine code must be model-agnostic (§2.4)`);
  }
  return findings;
}

const findings = [];
for (const file of walk(scanRoot)) {
  findings.push(...scanContent(relative(repoRoot, file), readFileSync(file, "utf8")));
}

if (findings.length > 0) {
  console.error("LEAK/STRUCTURAL SCAN FAIL:");
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("leak/structural scan: clean");
