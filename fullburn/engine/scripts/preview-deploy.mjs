#!/usr/bin/env node
/** Publishes the private preview to the existing `fullburn-engine` Worker on
 * the account's free workers.dev address (fullburn-preview.yml, dispatch-only,
 * main-only, the `fullburn` environment). Wiring only: every decision — which
 * reports, what the page says, whether it is private enough to publish,
 * whether the bundle is clean, whether the existing Worker may be replaced —
 * is a preview-lib function driven by the default suite (R14-06).
 *
 * It writes nothing to disk: the bundle is built in memory and uploaded.
 *
 *   node engine/scripts/preview-deploy.mjs --plan       print the live report it would show
 *   node engine/scripts/preview-deploy.mjs --dry-run    build and check, upload nothing
 *   node engine/scripts/preview-deploy.mjs [--verified <reports/LIVE_CHECK_….md>]
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  attestedFor,
  buildPreviewData,
  bundleRefusal,
  deployRefusal,
  existingBindingsRefusal,
  parseDoneReport,
  parseLiveReport,
  pickLatestDone,
  pickLatestLiveReport,
  servedPrivately,
  workerMetadata,
} from "./preview-lib.mjs";

const WS = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = "fullburn-engine";

async function data(verified) {
  const names = await readdir(`${WS}reports`);
  const liveName = pickLatestLiveReport(names);
  const liveParsed = liveName ? parseLiveReport(await readFile(`${WS}reports/${liveName}`, "utf8")) : null;
  const live = liveParsed ? { ...liveParsed, file: `reports/${liveName}`, attested: attestedFor(`reports/${liveName}`, verified) } : null;
  const dones = await Promise.all(
    names.filter((n) => /^DONE_phase\d+_[0-9a-f]{12}\.md$/.test(n)).map(async (n) => ({ file: `reports/${n}`, report: parseDoneReport(await readFile(`${WS}reports/${n}`, "utf8")) })),
  );
  const best = pickLatestDone(dones);
  return buildPreviewData({
    phase: (await readFile(`${WS}PHASE`, "utf8")).trim(),
    live,
    done: best ? { ...best.report, file: best.file } : null,
    builtAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? "local",
  });
}

async function bundle(pageData) {
  const out = await build({
    stdin: { contents: `import { makeWorker } from "./src/preview/worker.ts";\nexport default makeWorker(${JSON.stringify(pageData)});\n`, resolveDir: `${WS}engine`, loader: "ts", sourcefile: "<stdin>" },
    absWorkingDir: WS,
    bundle: true,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "worker", "import"],
    write: false,
    metafile: true,
    minify: false,
  });
  const text = out.outputFiles[0].text;
  const refusal = bundleRefusal(Object.keys(out.metafile.inputs), text);
  if (refusal) throw new Error(refusal);
  return text;
}

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const fail = (msg) => {
  console.error(`preview: ${msg}`);
  process.exit(1);
};

async function main(argv) {
  const verifiedAt = argv.indexOf("--verified");
  const verified = verifiedAt >= 0 ? argv[verifiedAt + 1] : null;
  const pageData = await data(verified);
  if (argv.includes("--plan")) {
    console.log(pageData.live?.file ?? "");
    return;
  }
  const config = { password: process.env.PREVIEW_PASSWORD ?? "", accessTeam: process.env.ACCESS_TEAM_DOMAIN ?? "", accessAud: process.env.ACCESS_AUD ?? "" };
  const text = await bundle(pageData);
  const refused = deployRefusal(config);
  if (argv.includes("--dry-run")) {
    console.log(`preview: bundle ok (${text.length} bytes); live report ${pageData.live?.file ?? "none"} (attested: ${pageData.live?.attested ?? false}); publish ${refused ? `would be REFUSED: ${refused}` : "would proceed"}`);
    return;
  }
  if (refused) fail(refused);
  for (const v of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) if (!process.env[v]) fail(`${v} is not set`);

  const settings = await cf(`/workers/scripts/${SCRIPT}/settings`);
  if (settings.status !== 404) {
    if (settings.status !== 200) fail(`could not read the ${SCRIPT} Worker's settings: HTTP ${settings.status} ${JSON.stringify(settings.body?.errors ?? [])}`);
    const r = existingBindingsRefusal(settings.body?.result?.bindings ?? []);
    if (r) fail(r);
  }

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(workerMetadata(config))], { type: "application/json" }));
  form.append("worker.js", new Blob([text], { type: "application/javascript+module" }), "worker.js");
  const up = await cf(`/workers/scripts/${SCRIPT}`, { method: "PUT", body: form });
  if (up.status !== 200 || up.body?.success !== true) fail(`upload refused: HTTP ${up.status} ${JSON.stringify(up.body?.errors ?? [])}`);

  const sub = await cf(`/workers/scripts/${SCRIPT}/subdomain`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
  if (sub.status !== 200) fail(`could not enable the workers.dev address: HTTP ${sub.status} ${JSON.stringify(sub.body?.errors ?? [])}`);
  const acct = await cf(`/workers/subdomain`);
  const host = acct.body?.result?.subdomain;
  if (!host) fail(`could not read the account's workers.dev subdomain: HTTP ${acct.status}`);
  const url = `https://${SCRIPT}.${host}.workers.dev/`;

  // The page must refuse a visitor with no credentials. A fresh address can
  // take a minute to resolve, so 404/5xx from the edge are retried.
  let status = 0;
  for (let i = 0; i < 12; i++) {
    status = await fetch(url, { redirect: "manual" }).then((r) => r.status, () => 0);
    if (status === 200 || status === 302 || status === 401 || status === 403) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  const verdict = servedPrivately(status);
  if (!verdict.ok) fail(`${url}: ${verdict.reason}`);
  console.log(`preview: published ${url} — ${verdict.reason}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => fail(e instanceof Error ? e.message : String(e)));
}
