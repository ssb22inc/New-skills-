/** THE PRIVATE PREVIEW'S BUILD-TIME DECISIONS, pure (R14-06). The runner,
 * `preview-deploy.mjs`, reads committed reports, hands their text to these
 * functions, bundles the page and uploads it; it decides nothing itself.
 *
 * The preview is a STATIC page baked at publish time from committed evidence:
 * the newest attested live check, the newest `done` report and the phase. It
 * makes no AI call and reads no service at request time — the Worker it
 * ships in imports no engine module that can (asserted on the bundle). */

/** Plain-English names for the live checks, in display order. */
export const LIVE_CHECK_NAMES = Object.freeze({
  "cloudflare-token": "Cloudflare account",
  "gateway-hello-world": "AI Gateway: a real AI call",
  "langfuse-trace": "Langfuse: the call was recorded",
  "clickhouse-query": "ClickHouse: the data warehouse answers",
  "airbyte-token": "Airbyte: data connectors can sign in",
});

/** A live check report → its verdict, tree, start time and rows. Only rows
 * whose id is a known check are kept, so a malformed report cannot inject
 * a row. Returns null for anything that is not a live check report. */
export function parseLiveReport(md) {
  const text = String(md ?? "");
  if (!/^# LIVE CHECK phase\d+$/m.test(text)) return null;
  const verdict = /^Verdict: (PASS|FAIL)$/m.exec(text)?.[1] ?? null;
  const tree = /^verified-tree: ([0-9a-f]{40})$/m.exec(text)?.[1] ?? null;
  const started = /Started (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(text)?.[1] ?? null;
  if (!verdict || !tree) return null;
  const rows = [];
  for (const line of text.split("\n")) {
    const m = /^\| ([a-z-]+) \| .*? \| (PASS|FAIL) \| (.*) \|$/.exec(line);
    if (m && Object.hasOwn(LIVE_CHECK_NAMES, m[1])) rows.push({ id: m[1], name: LIVE_CHECK_NAMES[m[1]], status: m[2], observed: m[3].replace(/\\\|/g, "|") });
  }
  return { verdict, tree, started, rows };
}

/** The newest live report among file names: timestamped names
 * (`…_<tree12>_<yyyymmddThhmmssZ>.md`) by their stamp; a legacy untimed name
 * only if no timestamped one exists, the last in the given (commit) order. */
export function pickLatestLiveReport(names) {
  const list = (names ?? []).filter((n) => /^LIVE_CHECK_phase\d+_[0-9a-f]{12}(?:_\d{8}T\d{6}Z)?\.md$/.test(n));
  const stamped = list.filter((n) => /_\d{8}T\d{6}Z\.md$/.test(n)).sort((a, b) => a.slice(-19).localeCompare(b.slice(-19)));
  if (stamped.length > 0) return stamped[stamped.length - 1];
  return list.length > 0 ? list[list.length - 1] : null;
}

/** A `done` report → its headline, tree, start time and top-level condition
 * rows (C1–C10; the `↳` sub-rows are not kept). Null for anything else. */
export function parseDoneReport(md) {
  const text = String(md ?? "");
  const headline = /^# DONE — Phase \d+ — ([A-Z ]+)$/m.exec(text)?.[1]?.trim() ?? null;
  if (!headline) return null;
  const tree = /^- tree: `([0-9a-f]{40})`$/m.exec(text)?.[1] ?? null;
  const started = /^- started: (\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/m.exec(text)?.[1] ?? null;
  const conditions = [];
  for (const line of text.split("\n")) {
    const m = /^\| (C\d+) \| (.*?) \| \*\*(PASS|FAIL)\*\* \|/.exec(line);
    if (m) conditions.push({ id: m[1], title: m[2], status: m[3] });
  }
  return conditions.length > 0 ? { headline, tree, started, conditions } : null;
}

/** The newest `done` report among parsed ones: by its own start time; one
 * without a start time never wins over one with. */
export function pickLatestDone(parsed) {
  const list = (parsed ?? []).filter((p) => p && p.report);
  if (list.length === 0) return null;
  return list.reduce((best, p) => ((p.report.started ?? "") > (best.report.started ?? "") ? p : best));
}

/** What is left before launch, in plain English. The human-owned items are
 * data, kept here so the page and the ledger cannot drift apart silently: a
 * change to this list is a reviewed code change. */
export const LEFT_BEFORE_LAUNCH = Object.freeze([
  Object.freeze({ who: "you", what: "Remove the admin bypass on the main branch rules, so the automatic checks can actually block a bad change." }),
  Object.freeze({ who: "you", what: "Set per-client spending caps in the Cloudflare AI Gateway — the outside-the-code money limit." }),
  Object.freeze({ who: "you", what: "Approve the starting 'A-grade' thresholds Fullburn grades itself against." }),
  Object.freeze({ who: "you", what: "Register fullburn.ai and complete the formal trademark check." }),
  Object.freeze({ who: "Claude", what: "Deploy the encrypted vault (keys stored in a Cloudflare Durable Object, rotated on a schedule)." }),
  Object.freeze({ who: "Claude", what: "Teach the completion check to read the signed live-check report, so live results count toward 'done'." }),
  Object.freeze({ who: "the reviewer", what: "A clean pass from the independent AI reviewer (GPT-6.1 Sol) on the finished Phase 0 code." }),
]);

export const PHASES = Object.freeze([
  "Foundation — the rails: money caps, model swapping, tracing, the vault, the safety checks",
  "Intake — paste a website, get a business brief and audit (no ad spend)",
  "Connect — the client's data flowing into their own warehouse",
  "Research — what customers actually say, and what competitors run",
  "Creative — finished ad batches, with false claims blocked",
  "Shadow mode — the full decision engine, spending nothing",
  "Go live — first real dollars, at floor budgets, with you approving",
  "The four client screens — Connect, Daily digest, Big red button, Chat",
]);

/** Everything the page shows, as one plain object. */
export function buildPreviewData({ phase, live, done, builtAt, commit }) {
  if (live && live.attested !== true && live.attested !== false) throw new Error("the live report's attestation status must be stated");
  const p = Number.parseInt(String(phase), 10);
  return {
    builtAt: String(builtAt),
    commit: String(commit),
    phase: Number.isInteger(p) && p >= 0 && p < PHASES.length ? p : 0,
    phases: PHASES,
    live: live ?? null,
    done: done ?? null,
    left: LEFT_BEFORE_LAUNCH,
  };
}

/** May this be published? It must be private: either Cloudflare Access is
 * fully configured (team domain AND application audience tag) or a password
 * is set. Neither, or a half-configured Access, is a refusal — a public
 * preview is never the fallback. */
export function deployRefusal({ password, accessTeam, accessAud }) {
  const hasAccess = Boolean(accessTeam) && Boolean(accessAud);
  if (Boolean(accessTeam) !== Boolean(accessAud)) return "Cloudflare Access is half-configured: set both ACCESS_TEAM_DOMAIN and ACCESS_AUD, or neither";
  if (accessTeam && !/^[a-z0-9-]+$/.test(String(accessTeam))) return "ACCESS_TEAM_DOMAIN must be the team name only (the part before .cloudflareaccess.com)";
  if (!hasAccess && !(typeof password === "string" && password.length >= 12)) return "the preview would be public: set PREVIEW_PASSWORD (12+ characters) or configure Cloudflare Access";
  return null;
}

/** The bundle may contain only the preview's own modules. An input outside
 * `src/preview/` — the gateway, the vault, a sink — means a code path that can
 * reach a service or an AI model shipped in the page's Worker: refused. The
 * text check is a second, independent net for the same thing. */
export const BUNDLE_FORBIDDEN_TEXT = Object.freeze(["gateway.ai.cloudflare.com", "openrouter", "/chat/completions", "api/public/otel"]);
export function bundleRefusal(inputs, text) {
  const outside = (inputs ?? []).filter((i) => !/(?:^|\/)engine\/src\/preview\/[a-z-]+\.ts$/.test(i) && !/(?:^|\/)<stdin>$/.test(i));
  if (outside.length > 0) return `the preview bundle includes modules outside src/preview/: ${outside.join(", ")}`;
  if (!(inputs ?? []).some((i) => /engine\/src\/preview\/auth\.ts$/.test(i))) return "the preview bundle does not include its sign-in check";
  const hit = BUNDLE_FORBIDDEN_TEXT.find((t) => String(text ?? "").includes(t));
  if (hit) return `the preview bundle mentions ${hit} — it must not be able to reach an AI or tracing service`;
  return null;
}

/** The existing Worker's bindings, read before replacing it. The upload
 * replaces every binding, so a binding the preview does not own (a Durable
 * Object, a KV store, a KEK) would be destroyed: refused instead. */
export const PREVIEW_BINDINGS = Object.freeze(["PREVIEW_PASSWORD", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD"]);
export function existingBindingsRefusal(bindings) {
  const foreign = (bindings ?? []).filter((b) => !PREVIEW_BINDINGS.includes(b?.name));
  if (foreign.length > 0) return `the fullburn-engine Worker has bindings this preview would destroy: ${foreign.map((b) => `${b?.name} (${b?.type})`).join(", ")}`;
  return null;
}

/** The page shows a live report as signed only if the workflow verified that
 * exact file's attestation. */
export function attestedFor(chosenFile, verifiedFile) {
  return typeof chosenFile === "string" && chosenFile.length > 0 && chosenFile === verifiedFile;
}

/** The upload's metadata: the module, the runtime date, and only the
 * preview's own bindings. */
export function workerMetadata({ password, accessTeam, accessAud }) {
  const bindings = [];
  if (password) bindings.push({ type: "secret_text", name: "PREVIEW_PASSWORD", text: password });
  if (accessTeam) bindings.push({ type: "plain_text", name: "ACCESS_TEAM_DOMAIN", text: accessTeam });
  if (accessAud) bindings.push({ type: "plain_text", name: "ACCESS_AUD", text: accessAud });
  return { main_module: "worker.js", compatibility_date: "2026-08-01", bindings };
}

/** After publishing: what an anonymous visitor got. Only a refusal (password
 * challenge, Access redirect, Access-mode 403) counts as private; a 200 means
 * the page is public and the run fails. */
export function servedPrivately(status) {
  if (status === 401) return { ok: true, reason: "an anonymous visitor is asked for the password" };
  if (status === 302) return { ok: true, reason: "an anonymous visitor is sent to the Cloudflare Access sign-in" };
  if (status === 403) return { ok: true, reason: "an anonymous visitor is refused (no Access sign-in token)" };
  if (status === 200) return { ok: false, reason: "PUBLIC — an anonymous visitor got the page" };
  return { ok: false, reason: `the address did not answer as expected (HTTP ${status || "no response"})` };
}
