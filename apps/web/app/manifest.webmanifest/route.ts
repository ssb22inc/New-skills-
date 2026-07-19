/** Minimal PWA manifest — the shell installs; features arrive by prompt. */
export function GET(): Response {
  return Response.json(
    {
      name: 'Sycamore',
      short_name: 'Sycamore',
      start_url: '/',
      display: 'standalone',
      background_color: '#F7F3EC',
      theme_color: '#0B1A26',
      icons: [],
    },
    { headers: { 'content-type': 'application/manifest+json' } },
  );
}
