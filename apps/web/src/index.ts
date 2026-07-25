export const WORKSPACE = '@sycamore/web';

/**
 * Route handlers the drill suite renders directly (tests/src/pwa). They
 * are plain `Request → Response` functions with no Next-specific
 * surface, so a test can exercise the REAL page rather than a copy of
 * its markup — a panel that stops rendering must fail a gate, not pass
 * a string match.
 */
export { GET as cockpitPage } from '../app/cockpit/route.js';
export { GET as webManifest } from '../app/manifest.webmanifest/route.js';
export { GET as whyPage } from '../app/why/[market]/[seller]/route.js';
export { GET as trustPage } from '../app/t/[market]/[seller]/route.js';
