import type { NextConfig } from 'next';

/**
 * Two deployment shapes, one config.
 *
 *   • Docker/Fly/Render: `output: 'standalone'` — a self-contained server
 *     bundle, with packs copied in beside it by the Dockerfile.
 *   • Vercel: no standalone (Vercel builds its own function bundles), and
 *     the pack YAML is declared to the file tracer so it ships inside
 *     every function. Packs are data read at runtime; a bundler cannot
 *     see a `readFileSync` of a computed path, so it has to be told.
 */
const onVercel = process.env.VERCEL === '1';

const nextConfig: NextConfig = {
  // Trust pages must be light: no client-side data fetching, RSC only.
  reactStrictMode: true,
  ...(onVercel ? {} : { output: 'standalone' as const }),
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  outputFileTracingIncludes: {
    '/**': ['../../packs/context/**', '../../packs/vertical/**', '../../packs/copy/**'],
  },
  poweredByHeader: false,
  compress: true,
  // Workspace packages use NodeNext ESM (.js specifiers for .ts files);
  // webpack needs the alias, and we opt out of Turbopack for it.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts'],
      '.jsx': ['.jsx', '.tsx'],
    };
    return config;
  },
};

export default nextConfig;
