/** THE LIVE CHECK'S DECISIONS, pure (R14-06: no verdict is reached where the
 * default suite cannot see it). The runner, `engine/test/live/services.live.ts`,
 * only talks to the provisioned services with the `fullburn` environment's
 * keys and hands what it OBSERVED to these functions.
 *
 * WHAT IT MEASURES (DONE.md C1, the "NOT MEASURABLE IN THIS ENVIRONMENT"
 * rows): the Cloudflare token is live; a hello-world call goes through the
 * REAL AI Gateway via llm(); its trace lands in the REAL Langfuse project;
 * ClickHouse answers a query; Airbyte issues a token. Each is one row; a row
 * passes only on the positive evidence it names, never on the absence of an
 * error.
 *
 * No secret ever reaches the report: every observed string is passed through
 * `redactObserved` with the run's secret values before it is rendered. */

export const LIVE_CHECKS = Object.freeze([
  Object.freeze({ id: "cloudflare-token", what: "the Cloudflare API token verifies as active" }),
  Object.freeze({ id: "gateway-hello-world", what: "AC1: a hello-world call through llm() and the real AI Gateway returns a schema-valid answer" }),
  Object.freeze({ id: "langfuse-trace", what: "AC1: that call's trace is readable back from the real Langfuse project" }),
  Object.freeze({ id: "clickhouse-query", what: "the ClickHouse service answers SELECT 1 over HTTPS" }),
  Object.freeze({ id: "airbyte-token", what: "Airbyte issues an access token for the configured application" }),
]);

/** Every check must be observed exactly once and PASS; anything missing,
 * duplicated or unknown fails the run. */
export function liveVerdict(observations) {
  const list = Array.isArray(observations) ? observations : [];
  const failing = [];
  for (const c of LIVE_CHECKS) {
    const seen = list.filter((o) => o?.id === c.id);
    if (seen.length !== 1) failing.push(`${c.id}: observed ${seen.length} times`);
    else if (seen[0].pass !== true) failing.push(`${c.id}: ${String(seen[0].observed ?? "no observation")}`);
  }
  for (const o of list) {
    if (!LIVE_CHECKS.some((c) => c.id === o?.id)) failing.push(`${String(o?.id)}: not a live check`);
  }
  return { ok: failing.length === 0, failing };
}

/** Replaces every secret value (and its URL-encoded and base64 forms) in an
 * observed string. Values shorter than 6 characters are not secrets worth
 * matching and would shred ordinary text. */
export function redactObserved(text, secrets) {
  let out = String(text ?? "");
  for (const s of secrets ?? []) {
    if (typeof s !== "string" || s.length < 6) continue;
    for (const form of [s, encodeURIComponent(s), Buffer.from(s).toString("base64")]) {
      out = out.split(form).join("[REDACTED]");
    }
  }
  return out.length > 300 ? `${out.slice(0, 300)}…` : out;
}

export function liveReportName(phase, tree) {
  if (!/^[0-9a-f]{40}$/.test(String(tree))) throw new Error("live report needs the full verified-tree hash");
  return `LIVE_CHECK_phase${phase}_${tree.slice(0, 12)}.md`;
}

/** The report. Line 2 is the verdict and line 3 binds the verified tree, the
 * same shape the adversary reports use. */
export function renderLiveReport({ phase, tree, commit, startedAt, observations, secrets, diagnostics = [] }) {
  const v = liveVerdict(observations);
  const lines = [
    `# LIVE CHECK phase${phase}`,
    `Verdict: ${v.ok ? "PASS" : "FAIL"}`,
    `verified-tree: ${tree}`,
    "",
    `Commit: \`${commit}\`. Started ${startedAt}. Run with the \`fullburn\` GitHub environment's keys, from main's own code (engine/test/live/services.live.ts).`,
    "",
    "| check | what | status | observed |",
    "|---|---|---|---|",
  ];
  for (const c of LIVE_CHECKS) {
    const o = (Array.isArray(observations) ? observations : []).find((x) => x?.id === c.id);
    const observed = redactObserved(o?.observed ?? "not observed", secrets).replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${c.id} | ${c.what} | ${o?.pass === true ? "PASS" : "FAIL"} | ${observed} |`);
  }
  if (!v.ok) lines.push("", "Failing:", ...v.failing.map((f) => `- ${redactObserved(f, secrets)}`));
  // Diagnostics never decide the verdict: they say WHY a check failed
  // (e.g. which gateway route the account's credits accept).
  const diag = Array.isArray(diagnostics) ? diagnostics : [];
  if (diag.length > 0) lines.push("", "Diagnostics (informational, not checks):", ...diag.map((d) => `- ${redactObserved(`${d?.name}: ${d?.observed}`, secrets).replace(/\n/g, " ")}`));
  return `${lines.join("\n")}\n`;
}
