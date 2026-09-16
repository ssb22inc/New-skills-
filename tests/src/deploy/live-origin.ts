/**
 * THE DEPLOYED-ORIGIN AUDIT — the machine-checkable half of the P36 gate.
 *
 * P36's gate reads: "Lighthouse PWA installability audit passes; manual
 * install verified on Android Chrome + iOS Safari." Until there was a
 * deployed origin, neither half could run, and the criteria were asserted
 * against source files instead (apps/web/src/pwa.test.ts). Source
 * assertions prove the code SAYS the right thing. They cannot prove the
 * deployed origin SERVES it — a missing `public/` in the image, a
 * service worker that 404s, a manifest behind a login wall, all pass a
 * string match and fail a phone.
 *
 * So this runs the installability criteria in a real browser against the
 * real origin: HTTPS, a linked and valid manifest, icons that are PNGs at
 * the size they claim, a service worker that reaches "activated" and
 * controls the page, and a seller's day that still renders with the
 * network cut. It also re-proves the asymmetric-client law (P36) where it
 * actually matters — in a browser that has never met a seller — and
 * re-measures the P14 trust-page budget over the wire rather than over
 * localhost.
 *
 * What it still cannot do is tap "Add to home screen". That stays a human
 * gate (BUILD_STATUS, human gate 8), and this script exists to make the
 * human's remaining job one tap rather than one investigation.
 *
 * Run: pnpm --filter @sycamore/tests deploy:audit
 *      SYCAMORE_ORIGIN=https://… pnpm --filter @sycamore/tests deploy:audit
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Some sandboxes (this build container among them) re-terminate outbound
 * TLS at an egress proxy, and every tool is pointed at that proxy's CA
 * bundle. Node reads it from NODE_EXTRA_CA_CERTS; Chromium has no such
 * switch and would reject the live origin with ERR_CERT_AUTHORITY_INVALID.
 *
 * So Chromium is told to trust exactly the public keys the rest of the
 * toolchain is already configured to trust, by SPKI hash — not to skip
 * verification. Any certificate outside that bundle still fails. Where no
 * bundle is configured, which is the normal case and CI's case, no flag is
 * passed at all and Chromium verifies against its own roots.
 */
function proxyCaPins(): string[] {
  const bundle = process.env.SYCAMORE_PROXY_CA ?? process.env.NODE_EXTRA_CA_CERTS;
  if (!bundle) return [];
  let pem: string;
  try {
    pem = readFileSync(bundle, 'utf8');
  } catch {
    return [];
  }
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  const pins: string[] = [];
  for (const block of blocks) {
    try {
      const spki = new X509Certificate(block).publicKey.export({ type: 'spki', format: 'der' });
      pins.push(createHash('sha256').update(spki).digest('base64'));
    } catch {
      // A bundle entry we cannot parse is simply not pinned.
    }
  }
  return pins;
}

const ORIGIN = (
  process.env.SYCAMORE_ORIGIN ?? 'https://sycamore-ssb22incs-projects.vercel.app'
).replace(/\/$/, '');

/** P14 / BUILD §5.3-1, unchanged from the local gate. */
const BUDGET_BYTES = 100_000;
const BUDGET_INTERACTIVE_MS = 2_000;

/** Design Language token INK — the manifest must carry it, not a lookalike. */
const INK = '#0B1A26';
const PAPER = '#F7F3EC';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
}

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** Parse a real PNG header. No image library, no trust in the filename. */
function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) return undefined;
  for (const [i, byte] of signature.entries()) if (bytes[i] !== byte) return undefined;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Find a seller to audit from the deployment itself. The demo index is
 * the only surface that lists sellers, which is the point: there is no
 * directory in the product, so a machine with no database access
 * discovers its subjects the same way a founder does.
 */
async function discoverSellers(): Promise<{ market: string; seller: string }[]> {
  const res = await fetch(`${ORIGIN}/demo`);
  if (!res.ok) {
    throw new Error(
      `${ORIGIN}/demo answered ${res.status}. The audit needs a seeded deployment ` +
        'with SYCAMORE_DEMO_INDEX on, or an explicit seller via SYCAMORE_SELLER=market/id.',
    );
  }
  const html = await res.text();
  const found = new Map<string, { market: string; seller: string }>();
  for (const m of html.matchAll(/\/s\/([a-z]{2})\/([0-9a-f-]{36})\?offer=1/g)) {
    const [, market, seller] = m;
    if (market && seller) found.set(`${market}/${seller}`, { market, seller });
  }
  if (found.size === 0) throw new Error('no seller link found on the demo index');
  return [...found.values()];
}

/**
 * Wait for the worker to reach "activated", reporting whatever state it
 * actually reached.
 *
 * An earlier version raced `serviceWorker.ready` against a fixed timeout
 * and reported "none" on a slow install — which is not a diagnosis, it is
 * a shrug, and it made a passing origin look broken. Installing this
 * worker costs three network fetches (`cache.addAll` on the shell), so on
 * a slow link it legitimately takes a while. Poll instead, name the state
 * reached, and let the budget be generous: a false red on a permanent
 * gate is worse than a slow green.
 */
async function waitForServiceWorker(page: Page, budgetMs = 60_000): Promise<string> {
  const deadline = Date.now() + budgetMs;
  let state: string;
  do {
    state = await page.evaluate(async () => {
      const nav = navigator as unknown as {
        serviceWorker?: { getRegistration: (scope?: string) => Promise<unknown> };
      };
      if (!nav.serviceWorker) return 'unsupported';
      const registration = (await nav.serviceWorker.getRegistration('/')) as
        | {
            installing?: { state: string } | null;
            waiting?: { state: string } | null;
            active?: { state: string } | null;
          }
        | undefined;
      if (!registration) return 'none';
      return (
        registration.active?.state ??
        registration.waiting?.state ??
        registration.installing?.state ??
        'registered'
      );
    });
    if (state === 'activated' || state === 'unsupported') return state;
    await page.waitForTimeout(1_500);
  } while (Date.now() < deadline);
  return state;
}

async function auditInstallability(
  browser: Browser,
  market: string,
  seller: string,
): Promise<void> {
  record(
    'served over HTTPS',
    ORIGIN.startsWith('https://'),
    `${ORIGIN} — a secure origin is a hard installability criterion`,
  );

  const context = await browser.newContext();
  const page = await context.newPage();
  const dayUrl = `${ORIGIN}/s/${market}/${seller}?offer=1`;
  await page.goto(dayUrl, { waitUntil: 'load', timeout: 60_000 });

  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  record(
    'the seller’s day links a manifest',
    Boolean(manifestHref),
    manifestHref ?? 'no <link rel="manifest"> in the document',
  );

  const manifestUrl = new URL(manifestHref ?? '/manifest.webmanifest', ORIGIN).toString();
  const manifestRes = await fetch(manifestUrl);
  const manifest = manifestRes.ok ? ((await manifestRes.json()) as Manifest) : undefined;
  record(
    'the manifest is served and parses',
    Boolean(manifest),
    `${manifestUrl} → ${manifestRes.status} ${manifestRes.headers.get('content-type') ?? ''}`,
  );
  if (!manifest) {
    await context.close();
    return;
  }

  const displays = ['standalone', 'fullscreen', 'minimal-ui'];
  record(
    'the manifest meets every installability criterion',
    Boolean(manifest.name) &&
      Boolean(manifest.short_name) &&
      manifest.short_name.length <= 12 &&
      Boolean(manifest.start_url) &&
      displays.includes(manifest.display) &&
      manifest.theme_color === INK &&
      manifest.background_color === PAPER,
    `name=${manifest.name} short_name=${manifest.short_name} display=${manifest.display} ` +
      `theme=${manifest.theme_color}`,
  );

  const sizes = manifest.icons.map((i) => i.sizes);
  record(
    'the manifest declares 192 and 512 icons, one maskable',
    sizes.includes('192x192') &&
      sizes.includes('512x512') &&
      manifest.icons.every((i) => i.type === 'image/png') &&
      manifest.icons.some((i) => i.purpose === 'maskable'),
    `${manifest.icons.length} icons: ${sizes.join(', ')}`,
  );

  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, ORIGIN).toString();
    const res = await fetch(iconUrl);
    const bytes = Buffer.from(await res.arrayBuffer());
    const declared = Number(icon.sizes.split('x')[0]);
    const actual = pngSize(bytes);
    record(
      `${icon.src} is a real PNG at ${icon.sizes}`,
      res.ok && actual?.width === declared && actual.height === declared,
      actual
        ? `${actual.width}x${actual.height}, ${bytes.byteLength} B`
        : `${res.status}, not a PNG (${bytes.byteLength} B)`,
    );
  }

  const state = await waitForServiceWorker(page);
  record(
    'the service worker activates on the deployed origin',
    state === 'activated',
    `registration state: ${state}`,
  );

  // A worker that is active but not controlling would still fail a phone
  // the first time the network drops, so prove control, not registration.
  await page.reload({ waitUntil: 'load', timeout: 60_000 });
  const controlled = await page.evaluate(() => {
    const nav = navigator as unknown as { serviceWorker?: { controller: unknown } };
    return Boolean(nav.serviceWorker?.controller);
  });
  record('the service worker controls the page', controlled, `controller present: ${controlled}`);

  const businessName = (await page.textContent('h1'))?.trim() ?? '';
  record(
    'the seller’s day renders on the deployed origin',
    businessName.length > 0,
    businessName || 'no business name in the document',
  );

  // The whole point of the installed client: the day survives the network.
  // Skipped rather than failed when no worker is controlling, because the
  // controller check above already owns that failure and one cause should
  // not produce two red lines.
  if (!controlled) {
    await context.close();
    return;
  }
  await context.setOffline(true);
  let offlineName: string;
  let offlineOk = false;
  try {
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    offlineName = (await page.textContent('h1'))?.trim() ?? '';
    offlineOk = offlineName === businessName;
  } catch (err) {
    offlineName = err instanceof Error ? err.message : String(err);
  }
  record(
    'the seller’s day still renders with the network cut',
    offlineOk,
    offlineOk ? `${offlineName}, served from the worker's cache` : offlineName,
  );
  await context.setOffline(false);
  await context.close();
}

/**
 * P36b — the offer is EARNED, never ambient.
 *
 * Checked as the rule rather than against one seller, because one seller
 * cannot express it: the panel must be absent from every seller's day
 * that core did not mark with `?offer=1`, and must render for a seller
 * who carries it and has not already installed. A seller whose client
 * reports an existing install correctly hides it even with the flag —
 * that is the two-offer cap doing its job, not a failure, so it is
 * counted and named rather than treated as one.
 */
async function auditEarnedOffer(
  browser: Browser,
  sellers: { market: string; seller: string }[],
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const ambient: string[] = [];
  const offered: string[] = [];
  const suppressed: string[] = [];
  for (const { market, seller } of sellers) {
    const base = `${ORIGIN}/s/${market}/${seller}`;
    await page.goto(base, { waitUntil: 'load', timeout: 60_000 });
    const name = (await page.textContent('h1'))?.trim() ?? seller;
    if (await page.locator('#install-offer').isVisible()) ambient.push(name);

    await page.goto(`${base}?offer=1`, { waitUntil: 'load', timeout: 60_000 });
    if (await page.locator('#install-offer').isVisible()) offered.push(name);
    else suppressed.push(name);
  }

  record(
    'no seller is offered an install unless core said so',
    ambient.length === 0,
    ambient.length === 0
      ? `${sellers.length} sellers, none showed the panel without ?offer=1`
      : `offered without the flag: ${ambient.join(', ')}`,
  );
  record(
    'the earned offer renders on the deployed origin',
    offered.length > 0,
    offered.length > 0
      ? `offered to ${offered.join(', ')}` +
          (suppressed.length > 0
            ? `; suppressed for ${suppressed.join(', ')} (already installed)`
            : '')
      : `every seller suppressed the panel: ${suppressed.join(', ')}`,
  );
  await context.close();
}

/**
 * The asymmetric-client law, checked where it counts: a browser that has
 * never opened a seller's day. (The worker's scope is the whole origin,
 * so a buyer who arrived via a seller's page WOULD be controlled — which
 * is why this uses its own context, and why the claim is about a buyer
 * arriving from a link, exactly as Constitution §1 describes them.)
 */
async function auditBuyerAsymmetry(
  browser: Browser,
  market: string,
  seller: string,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/t/${market}/${seller}`, { waitUntil: 'load', timeout: 60_000 });

  const registered = await page.evaluate(async () => {
    const nav = navigator as unknown as {
      serviceWorker?: { getRegistrations: () => Promise<unknown[]> };
    };
    if (!nav.serviceWorker) return 0;
    return (await nav.serviceWorker.getRegistrations()).length;
  });
  record(
    'a buyer’s browser registers no service worker',
    registered === 0,
    `${registered} registrations after loading the trust page`,
  );

  const body = ((await page.textContent('body')) ?? '').toLowerCase();
  record(
    'no buyer surface asks anyone to install',
    !body.includes('add to home screen') &&
      !body.includes('home screen') &&
      (await page.locator('#install-offer').count()) === 0,
    'trust page carries no install affordance',
  );
  await context.close();
}

async function auditTrustBudget(browser: Browser, market: string, seller: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // Throttled 3G on a mid-Android — the same profile as the local gate.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  let transferred = 0;
  cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => {
    transferred += e.encodedDataLength;
  });

  await page.goto(`${ORIGIN}/t/${market}/${seller}`, { waitUntil: 'load', timeout: 120_000 });
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation' as never)[0] as unknown as {
      domInteractive: number;
    };
    return { interactive: nav.domInteractive };
  });
  const cta = await page.getAttribute('[data-cta="whatsapp"]', 'href');

  record(
    'the trust page holds its budget over the wire',
    transferred > 0 && transferred < BUDGET_BYTES && timing.interactive < BUDGET_INTERACTIVE_MS,
    `${transferred} B transferred, interactive ${Math.round(timing.interactive)} ms ` +
      `(budget ${BUDGET_BYTES} B / ${BUDGET_INTERACTIVE_MS} ms on throttled 3G)`,
  );
  record(
    'the buyer’s one door is a WhatsApp link',
    cta?.startsWith('https://wa.me/') ?? false,
    cta ?? 'no WhatsApp call to action',
  );
  await context.close();
}

async function main(): Promise<void> {
  console.log(`Auditing the deployed origin: ${ORIGIN}\n`);
  const explicit = process.env.SYCAMORE_SELLER?.split('/');
  const sellers =
    explicit?.length === 2 && explicit[0] && explicit[1]
      ? [{ market: explicit[0], seller: explicit[1] }]
      : await discoverSellers();
  const subject = sellers[0];
  if (!subject) throw new Error('no seller to audit');
  console.log(`Subjects: ${sellers.map((s) => `${s.market}/${s.seller}`).join(', ')}\n`);

  const pins = proxyCaPins();
  if (pins.length > 0) {
    console.log(`(trusting ${pins.length} CA public keys from the configured bundle)\n`);
  }
  // This container ships Chromium at a fixed path; CI installs Playwright's
  // own. Use the preinstalled one when it is there, and Playwright's
  // default when it is not, so the same script runs in both places.
  const preinstalled = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: [
      '--no-sandbox',
      ...(pins.length > 0 ? [`--ignore-certificate-errors-spki-list=${pins.join(',')}`] : []),
    ],
  });
  try {
    await auditInstallability(browser, subject.market, subject.seller);
    await auditEarnedOffer(browser, sellers);
    await auditBuyerAsymmetry(browser, subject.market, subject.seller);
    await auditTrustBudget(browser, subject.market, subject.seller);
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  console.log(
    failed.length === 0
      ? '✅ GATE PASSED: the deployed origin is installable. The remaining half of\n' +
          '   P36 is a human tapping "Add to home screen" on Android Chrome and iOS Safari.'
      : `❌ GATE FAILED: ${failed.map((c) => c.name).join('; ')}`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
