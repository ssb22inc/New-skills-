/** THE CROSS-FAMILY READ, as a runner. Gathers the verified tree, posts it to
 * the pinned non-Claude reviewer through OpenRouter, and writes the report the
 * pure library decides on. Every decision is in `cross-family-lib.mjs`
 * (R14-06); this file moves bytes.
 *
 * FAILS CLOSED, in this order: inside a test worker → refuse; no
 * OPENROUTER_API_KEY → exit 2 saying NOT CONFIGURED (never a report); dirty
 * tree → refuse; served model ≠ pinned reviewer → no report; response not the
 * contract → no report. A report is written only as the last act, atomically
 * (write `.partial`, then rename), and a crashed run's `.partial` is removed at
 * the next start and on every exit (recorder discipline, invariants suite).
 *
 * A stand-in endpoint (FULLBURN_CROSS_FAMILY_ENDPOINT) exists for the
 * integration suite and can never produce `Verdict: PASS` — see `crossVerdict`. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  PRODUCTION_ENDPOINT,
  parseTarget,
  READ_ADDENDUM,
  REVIEWER_MODEL,
  buildReviewRequest,
  bundleFiles,
  crossVerdict,
  nextCrossRound,
  parseReview,
  preflightRefusal,
  renderCrossReport,
  servedModelAcceptable,
} from "./cross-family-lib.mjs";
import { VERIFIED_TREE_SCOPE } from "./gate-lib.mjs";
import { looksBinary } from "./scan-lib.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const REPO = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const REPORTS = `${ROOT}/reports`;
const DEFINITION = `${REPO}/.claude/agents/engine-adversary.md`;

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** EVERYTHING PRINTED OR SAVED PASSES THROUGH HERE (cross-family finding
 * X2-05, 2026-09-24): the router's error bodies, a non-JSON body, a rejected
 * answer and the raw response were written verbatim, and an upstream that
 * echoes the bearer would have put the key into a log line, a job summary and
 * a committed artifact. The key is the one secret this process holds. */
const KEY = process.env.OPENROUTER_API_KEY ?? "";
const scrub = (text) => (KEY.length >= 8 ? String(text).split(KEY).join("[redacted]") : String(text));

/** Anything a crashed run could have left: a `.partial` report. */
function removeStaleCanary(reports = REPORTS) {
  if (!existsSync(reports)) return;
  for (const n of readdirSync(reports)) {
    if (/^ADVERSARY_REPORT_phase\d+\.x\d+\.md\.partial$/.test(n)) rmSync(`${reports}/${n}`, { force: true });
  }
}

const git = (args, { cwd = REPO, input = null } = {}) =>
  new Promise((res) => {
    const c = spawn("git", args, { cwd, stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => res({ code, out, err }));
    if (input !== null) c.stdin.end(input);
  });

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  /** THE REVIEWER RUNS FROM TRUSTED CODE; THE TREE UNDER REVIEW IS DATA
   * (cross-family finding X6-01, 2026-10-06). With `--target <checkout>`, this
   * runner, its prompt and the adversary definition are the ones next to this
   * file — `main`'s, when the workflow is dispatched there — and only the
   * reviewed tree, its phase and its reports directory come from the target. */
  const target = parseTarget(argv, REPO);
  if (target.error) {
    console.error(`CROSS-FAMILY READ: REFUSED — ${target.error}`);
    return 2;
  }
  const TREPO = target.repo;
  const TROOT = `${TREPO}/fullburn`;
  const TREPORTS = `${TROOT}/reports`;
  const tgit = (args, opts = {}) => git(args, { cwd: TREPO, ...opts });
  const phase = readFileSync(`${TROOT}/PHASE`, "utf8").trim();
  const endpoint = process.env.FULLBURN_CROSS_FAMILY_ENDPOINT || PRODUCTION_ENDPOINT;
  const key = process.env.OPENROUTER_API_KEY;

  if (!dryRun && !key) {
    console.error("CROSS-FAMILY READ: NOT CONFIGURED — OPENROUTER_API_KEY is not set. No read was made and no report was written (fails closed).");
    return 2;
  }
  const porcelain = (await tgit(["status", "--porcelain"])).out;
  const refusal = preflightRefusal({ dirty: porcelain.trim() !== "", endpoint, allowDirty: process.env.FULLBURN_CROSS_FAMILY_ALLOW_DIRTY === "1", dryRun });
  if (refusal) {
    console.error(`CROSS-FAMILY READ: REFUSED — ${refusal}:\n${porcelain}`);
    return 2;
  }
  // The same hash the completion checker prints: `git ls-files -s` over the
  // verified scope, from the REPOSITORY root, piped through hash-object.
  const listing = (await tgit(["ls-files", "-s", "--", ...VERIFIED_TREE_SCOPE])).out;
  const treeHash = (await tgit(["hash-object", "--stdin"], { input: listing })).out.trim();
  const commit = (await tgit(["rev-parse", "--short", "HEAD"])).out.trim();
  const branch = (await tgit(["rev-parse", "--abbrev-ref", "HEAD"])).out.trim();
  const paths = (await tgit(["ls-files", "--", ...VERIFIED_TREE_SCOPE])).out.split("\n").filter(Boolean);
  const entries = paths.map((p) => ({ path: p, bytes: readFileSync(`${TREPO}/${p}`) }));
  const bundle = bundleFiles(entries, looksBinary);
  const definition = readFileSync(DEFINITION, "utf8");
  const request = buildReviewRequest({ definition, bundle, tree: treeHash, phase });
  const round = nextCrossRound(existsSync(TREPORTS) ? readdirSync(TREPORTS) : [], phase);
  const startedAt = new Date().toISOString();

  console.log(`CROSS-FAMILY READ ${round} — tree ${treeHash} (${bundle.included.length} files, ${bundle.bytes} bytes; ${bundle.omitted.length} omitted) → ${REVIEWER_MODEL} at ${endpoint}`);
  if (dryRun) {
    console.log(`DRY RUN — request built (${Buffer.byteLength(JSON.stringify(request), "utf8")} bytes), nothing sent, no report written. Exit 3 so this can never read as a completed read.`);
    return 3;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "fullburn cross-family read" },
    body: JSON.stringify(request),
  });
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error(scrub(`CROSS-FAMILY READ: the router answered ${res.status} with a non-JSON body; no report written.\n${raw.slice(0, 500)}`));
    return 1;
  }
  if (!res.ok || json.error) {
    console.error(scrub(`CROSS-FAMILY READ: router error ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 500)}; no report written.`));
    return 1;
  }
  const served = servedModelAcceptable(REVIEWER_MODEL, json.model);
  if (!served.ok) {
    console.error(scrub(`CROSS-FAMILY READ: REFUSED — ${served.reason}; no report written.`));
    return 1;
  }
  const text = json.choices?.[0]?.message?.content;
  const parsed = parseReview(text);
  if (!parsed.ok) {
    console.error(scrub(`CROSS-FAMILY READ: REFUSED — the reviewer's answer is not the contract (${parsed.reason}); no report written. Raw answer saved for inspection.`));
    writeFileSync(`${TREPORTS}/cross-family-${round}-rejected-${Date.now()}.raw.json`, scrub(raw));
    return 1;
  }
  const verdict = crossVerdict(parsed.value, endpoint);
  // The reviewer's own text is scrubbed too: an answer quoting the bearer from
  // a request echo must not reach the report.
  const scrubbed = JSON.parse(scrub(JSON.stringify(parsed.value)));
  let report = renderCrossReport({
    phase,
    round,
    tree: treeHash,
    commit,
    branch,
    requestedModel: REVIEWER_MODEL,
    servedModel: json.model,
    endpoint,
    review: scrubbed,
    verdict,
    bundle,
    usage: json.usage,
    responseId: json.id,
    addendumHash: sha256(READ_ADDENDUM),
    definitionHash: sha256(definition),
    startedAt,
  });
  // The FINISHED report is scrubbed too (X3-05): the response id, usage and
  // served model are interpolated from the upstream's own fields.
  report = scrub(report);
  const name = `ADVERSARY_REPORT_phase${phase}.${round}.md`;
  const partial = `${TREPORTS}/${name}.partial`;
  writeFileSync(partial, report);
  writeFileSync(`${TREPORTS}/${name.replace(/\.md$/, ".raw.json")}`, scrub(raw));
  renameSync(partial, `${TREPORTS}/${name}`);
  console.log(scrub(`report: reports/${name}  sha256 ${sha256(report)}\nVerdict: ${verdict.verdict} — ${verdict.why}\n${parsed.value.findings.length} finding(s); ${parsed.value.limitations.length} limitation(s).`));
  return verdict.verdict === "PASS" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.VITEST) {
    console.error("CROSS-FAMILY READ: REFUSED — does not run inside a test worker");
    process.exit(2);
  }
  const t = parseTarget(process.argv.slice(2), REPO);
  if (!t.error) {
    removeStaleCanary(`${t.repo}/fullburn/reports`);
    process.on("exit", () => removeStaleCanary(`${t.repo}/fullburn/reports`));
  }
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(scrub(`CROSS-FAMILY READ: crashed — ${e instanceof Error ? e.stack ?? e.message : String(e)}; no report written.`));
      process.exit(1);
    },
  );
}
