import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture all transactions server-side (low volume compared to client).
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,

  // Never send raw request bodies to Sentry — they may contain PII or secrets.
  sendDefaultPii: false,

  beforeSend(event) {
    // Strip cookie and authorization headers from captured events.
    if (event.request?.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['authorization'];
    }
    return event;
  },
});
