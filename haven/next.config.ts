import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Validate required env vars at startup so the build fails fast rather than
// producing a broken bundle with silent runtime failures.
const requiredEnvVars: Record<string, string> = {
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    'Set it in .env.local (development) or as a CI/CD secret (production).',
  NEXT_PUBLIC_SUPABASE_URL:
    'Set it in .env.local (development) or as a CI/CD secret (production).',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'Set it in .env.local (development) or as a CI/CD secret (production).',
};

for (const [key, hint] of Object.entries(requiredEnvVars)) {
  if (!process.env[key]) {
    throw new Error(`${key} is required. ${hint}`);
  }
}

// Server-side secrets cannot be validated here (NEXT_PUBLIC_ prefix only),
// but JWT_SECRET is validated at module load in src/lib/security/auth.ts.

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Upload source maps to Sentry on production builds so stack traces are
  // readable. Requires SENTRY_AUTH_TOKEN and SENTRY_ORG/SENTRY_PROJECT.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
