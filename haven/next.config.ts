import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Validate required env vars at startup so the build fails fast rather than
// producing a broken bundle with silent runtime failures.
const requiredPublicEnvVars: Record<string, string> = {
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    'Set it in .env.local (development) or as a CI/CD secret (production).',
  NEXT_PUBLIC_SUPABASE_URL:
    'Set it in .env.local (development) or as a CI/CD secret (production).',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'Set it in .env.local (development) or as a CI/CD secret (production).',
};

for (const [key, hint] of Object.entries(requiredPublicEnvVars)) {
  if (!process.env[key]) {
    throw new Error(`${key} is required. ${hint}`);
  }
}

// Server-side secrets validated at build time. Set SKIP_ENV_VALIDATION=1 in
// lint-only CI steps where secrets are unavailable.
if (process.env.SKIP_ENV_VALIDATION !== '1') {
  const requiredServerEnvVars: Record<string, string> = {
    SUPABASE_SERVICE_ROLE_KEY: 'Supabase service role key — server-side only.',
    STRIPE_SECRET_KEY: 'Stripe secret key — server-side only.',
    STRIPE_WEBHOOK_SECRET: 'Stripe webhook signing secret.',
    OPENAI_API_KEY: 'OpenAI API key.',
    UPSTASH_REDIS_REST_URL: 'Upstash Redis REST URL for rate limiting.',
    UPSTASH_REDIS_REST_TOKEN: 'Upstash Redis REST token for rate limiting.',
    METRICS_TOKEN: 'Bearer token protecting /api/metrics (min 32 chars).',
    JWT_SECRET: 'JWT signing secret (min 32 chars). Generate: openssl rand -hex 32',
  };

  for (const [key, hint] of Object.entries(requiredServerEnvVars)) {
    if (!process.env[key]) {
      throw new Error(`${key} is required. ${hint}`);
    }
  }

  if ((process.env.METRICS_TOKEN ?? '').length < 32) {
    throw new Error('METRICS_TOKEN must be at least 32 characters.');
  }

  if ((process.env.JWT_SECRET ?? '').length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
}

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
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
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
