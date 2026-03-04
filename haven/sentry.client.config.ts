import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: capture 10% of transactions in production,
  // 100% in development/staging.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay: record 1% of sessions normally, 100% on error.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default to protect user PII.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,

  // Strip query strings from breadcrumb URLs to avoid logging PII.
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'navigation' && breadcrumb.data?.to) {
      try {
        const url = new URL(breadcrumb.data.to, 'https://placeholder');
        breadcrumb.data.to = url.pathname;
      } catch {
        // Ignore malformed URLs
      }
    }
    return breadcrumb;
  },
});
