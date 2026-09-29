/* Launching a real browser from inside this container.
   ------------------------------------------------------------------
   Two things stand between a Playwright script and the live site, and both
   look like the site is broken when they are not.

   1. THE PINNED BROWSER. The image ships one Chromium build; the installed
      Playwright expects a different revision number and would otherwise try to
      download its own into a sandbox that throws it away.

   2. THE PROXY'S CERTIFICATE. All egress is re-terminated by the agent proxy,
      which signs the connection with its own CA. Node, curl and git are
      configured to trust it; Chromium is not, so EVERY https page fails with
      ERR_CERT_AUTHORITY_INVALID — including google.com, which is how you can
      tell it is the proxy and not the site.

   The fix for (2) is deliberately narrow. Turning certificate checking off
   would mean this script could no longer tell a good certificate from a bad
   one, so a genuinely broken certificate on pulsern.app — an expiry nobody
   renewed, say — would sail through the very test meant to catch it. Instead
   the proxy's public key is trusted BY HASH: every other certificate on the
   internet is still fully validated.

   The hash is read from the CA file at run time rather than written down here,
   because the proxy mints a fresh CA per container. A hard-coded hash is a test
   that passes today and fails mysteriously next week. */

import fs from "node:fs";
import { X509Certificate, createHash } from "node:crypto";
import { chromium } from "playwright";

const CHROMIUM = "/opt/pw-browsers/chromium";
const PROXY_CA = "/root/.ccr/agent-proxy-ca.crt";

/* base64 sha256 of the certificate's SubjectPublicKeyInfo — the same form
   Chromium's --ignore-certificate-errors-spki-list expects. */
export function spkiHash(pem) {
  const der = new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("base64");
}

function proxyCaHashes() {
  try {
    return [spkiHash(fs.readFileSync(PROXY_CA))];
  } catch {
    return [];   // running outside the sandbox: nothing to trust, nothing to fix
  }
}

export async function launchBrowser(opts = {}) {
  const hashes = proxyCaHashes();
  const args = ["--no-sandbox", ...(opts.args ?? [])];
  if (hashes.length) args.push(`--ignore-certificate-errors-spki-list=${hashes.join(",")}`);

  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;

  return chromium.launch({
    executablePath: process.env.PW_CHROME || (fs.existsSync(CHROMIUM) ? CHROMIUM : undefined),
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    ...opts,
    args,
  });
}
