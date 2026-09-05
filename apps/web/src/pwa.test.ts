/**
 * P36a GATE — installability, and the asymmetry that governs it.
 *
 * The Lighthouse "installable" audit is a checklist, and this file is
 * that checklist executed against the real manifest, the real icons, and
 * the real service worker. Running Lighthouse itself against a deployed
 * origin, plus a manual install on Android Chrome and iOS Safari, is a
 * HUMAN GATE (tracked in BUILD_STATUS.md) — a container cannot tap
 * "Add to home screen".
 *
 * The second half is the rule Lighthouse cannot check: BUYER SURFACES
 * CARRY NO INSTALL AFFORDANCE, EVER.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GET as manifestRoute } from '../app/manifest.webmanifest/route.js';

const root = new URL('..', import.meta.url).pathname;
const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

const SELLER_DAY = read('../app/s/[market]/[seller]/route.ts');
const SERVICE_WORKER = read('../public/sw.js');
const TRUST_PAGE = read('../app/t/[market]/[seller]/route.ts');
const SOVEREIGN_DOOR = read('../app/c/[market]/[seller]/route.ts');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
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

async function manifest(): Promise<Manifest> {
  return (await manifestRoute().json()) as Manifest;
}

/** Parse an actual PNG header — no image library, no trust in filenames. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(`${root}public/icons/${file}`);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('P36a — the PWA is installable', () => {
  it('GATE: the manifest meets every installability criterion', async () => {
    const m = await manifest();
    expect(m.name).toBe('Sycamore');
    expect(m.short_name).toBe('Sycamore');
    expect(m.short_name.length).toBeLessThanOrEqual(12); // fits under a home-screen icon
    expect(m.start_url).toBeTruthy();
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
    // Design Language token INK.
    expect(m.theme_color).toBe('#0B1A26');
    expect(m.background_color).toBe('#F7F3EC');

    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.every((i) => i.type === 'image/png')).toBe(true);
    // Android crops to a circle; a maskable icon keeps the mark whole.
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('GATE: the declared icons are real PNGs at the declared sizes', async () => {
    const m = await manifest();
    for (const icon of m.icons) {
      const declared = Number(icon.sizes.split('x')[0]);
      expect(pngSize(icon.src.replace('/icons/', ''))).toEqual({
        width: declared,
        height: declared,
      });
    }
    // Small enough to install over a bad connection — the whole point.
    expect(readFileSync(`${root}public/icons/icon-512.png`).byteLength).toBeLessThan(60_000);
  });

  it('GATE: the service worker precaches the shell and runtime-caches the seller’s day', () => {
    expect(SERVICE_WORKER).toContain("addEventListener('install'");
    expect(SERVICE_WORKER).toContain("addEventListener('activate'");
    // A fetch handler is what makes a worker count as installable at all.
    expect(SERVICE_WORKER).toContain("addEventListener('fetch'");
    for (const shellUrl of [
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
    ]) {
      expect(SERVICE_WORKER).toContain(shellUrl);
    }
    expect(SERVICE_WORKER).toContain('day\\.json');
    // Network-first: a stale day is labelled, never presented as live.
    expect(SERVICE_WORKER).toMatch(/fetch\(request\)[\s\S]*caches\.match\(request\)/);
    // Old versions are evicted so a seller is never stuck on last month's shell.
    expect(SERVICE_WORKER).toContain('caches.delete');
  });

  it('the seller’s day registers the worker and replays the offline queue on reconnect', () => {
    expect(SELLER_DAY).toContain("serviceWorker.register('/sw.js'");
    expect(SELLER_DAY).toContain("addEventListener('online',flush)");
    // The queue reuses P34's keys verbatim — no new money logic client-side.
    expect(SELLER_DAY).toContain("idempotencyKey:'complete:'+id");
    expect(SELLER_DAY).toContain("kind:'complete_order'");
  });
});

describe('P36 — ASYMMETRIC CLIENTS: sellers are offered, buyers are never asked', () => {
  it('GATE: the browser’s own install prompt is always suppressed', () => {
    expect(SELLER_DAY).toContain("window.addEventListener('beforeinstallprompt'");
    expect(SELLER_DAY).toMatch(/beforeinstallprompt'[\s\S]{0,80}e\.preventDefault\(\)/);
  });

  it('GATE: the install offer renders only when it was EARNED', () => {
    // The panel is hidden unless core said so via ?offer=1 — and core
    // only says so to a seller, never during Genesis, at most twice.
    expect(SELLER_DAY).toContain("searchParams.get('offer') === '1'");
    expect(SELLER_DAY).toContain("showInstallOffer ? '' : 'hidden'");
    expect(SELLER_DAY).toContain('alreadyInstalled');
    // Declining is one tap, and it is recorded.
    expect(SELLER_DAY).toContain("kind:'install_declined'");
  });

  it('GATE: no buyer surface carries any install affordance', () => {
    for (const [name, source] of [
      ['trust page', TRUST_PAGE],
      ['sovereign chat door', SOVEREIGN_DOOR],
    ] as const) {
      expect(source, `${name} must never prompt an install`).not.toContain('beforeinstallprompt');
      expect(source, `${name} must never register a service worker`).not.toContain(
        'serviceWorker.register',
      );
      expect(source.toLowerCase(), `${name} must never ask anyone to install`).not.toContain(
        'add to home screen',
      );
    }
  });
});
