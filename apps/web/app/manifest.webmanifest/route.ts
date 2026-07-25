import { INK, PAPER } from '@sycamore/design';

/**
 * P36a — the installable client.
 *
 * The install is the seller's offline mode and our migration insurance
 * at once: a client WE own, ~1–2MB, no app store, no 30% cut, silent
 * updates, and it runs on the low-end Android our sellers actually
 * carry. Nothing here is required of anyone — a seller who never
 * installs loses nothing but offline mode, and a BUYER is never asked
 * (asymmetric clients, P36).
 *
 * `start_url` is the seller's day; the installed shell remembers which
 * market and seller it was installed from.
 */
export function GET(): Response {
  return Response.json(
    {
      id: '/s/',
      name: 'Sycamore',
      short_name: 'Sycamore',
      description: 'Your business, in your pocket — works even when the internet drops.',
      start_url: '/s/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: PAPER,
      // Design Language token INK.
      theme_color: INK,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json' } },
  );
}
