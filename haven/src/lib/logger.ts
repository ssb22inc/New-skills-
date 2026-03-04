import pino from 'pino';

// Structured logger using Pino. All application code should import this instead
// of calling console.log/error directly so that log output is consistently
// structured (JSON in production, pretty-printed in development) and so that
// sensitive fields can be redacted centrally.

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, ignore: 'pid,hostname' },
    },
  }),
  // Redact fields that may contain PII or secrets before they reach log sinks.
  redact: {
    paths: [
      'email',
      'password',
      'token',
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      '*.email',
      '*.password',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  base: {
    env: process.env.NODE_ENV,
    service: 'haven',
    version: process.env.APP_VERSION ?? '1.0.0',
  },
  // Rename default fields to match common log aggregator conventions.
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'msg',
});

/**
 * Returns a child logger pre-bound with a requestId for per-request tracing.
 */
export function requestLogger(requestId: string) {
  return logger.child({ requestId });
}
