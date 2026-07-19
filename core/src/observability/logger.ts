import { pino, type Logger } from 'pino';

/** One structured logger for the whole monolith; children carry module names. */
export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
  });
}
