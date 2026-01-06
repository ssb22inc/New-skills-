export const securityConfig = {
  // Rate limiting
  rateLimit: {
    default: { requests: 100, window: '1m' },
    auth: { requests: 5, window: '1m' },
    ai: { requests: 20, window: '1m' },
    upload: { requests: 10, window: '1m' },
  },

  // Session
  session: {
    maxAge: 24 * 60 * 60, // 24 hours
    refreshThreshold: 60 * 60, // Refresh if < 1 hour left
  },

  // Password policy
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    maxAge: 90, // days
  },

  // File upload
  upload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    scanForMalware: true,
  },

  // CORS
  cors: {
    allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL, 'https://js.stripe.com'].filter(
      Boolean
    ) as string[],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowCredentials: true,
  },

  // Content Security Policy
  csp: {
    reportUri: '/api/security/csp-report',
    reportOnly: process.env.NODE_ENV === 'development',
  },

  // Audit logs
  audit: {
    retentionDays: 90,
    batchSize: 50,
    flushInterval: 5000, // ms
  },
};

export default securityConfig;
