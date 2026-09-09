import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

/** The connection type every service takes — named so apps can type it without importing kysely. */
export type Db = Kysely<Database>;

export function createDb(connectionString: string): Kysely<Database> {
  // On a serverless host every warm instance holds its own pool, and a
  // hosted Postgres pooler has a small, shared connection budget — ten
  // per instance would exhaust it under the first real burst. Two is
  // plenty for a request; the process-per-request shape does the rest.
  const max = process.env.VERCEL === '1' ? 2 : 10;
  const pool = new pg.Pool({ connectionString, max });
  // Clients killed by failover/chaos emit 'error' events; without handlers
  // those crash the process. Query promises still reject with the failure.
  pool.on('error', () => {});
  pool.on('connect', (client) => client.on('error', () => {}));
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

/**
 * The environment variable names a Postgres URL may arrive under, in
 * precedence order. `DATABASE_URL` is ours. The rest are what hosted
 * integrations write on the founder's behalf — the Supabase ↔ Vercel
 * integration sets `POSTGRES_URL` (pooled) and its siblings, never
 * `DATABASE_URL` — and a deploy should not stay dark because the secret
 * landed under a vendor's spelling of the same thing.
 */
export const DATABASE_URL_NAMES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'SUPABASE_DB_URL',
] as const;

/** Which of DATABASE_URL_NAMES is set (first wins), or undefined if none is. */
export function databaseUrlSource(): string | undefined {
  return DATABASE_URL_NAMES.find((name) => Boolean(process.env[name]));
}

/** Dev default matches docker-compose.yml / .env.example. */
export function databaseUrl(): string {
  const source = databaseUrlSource();
  return (source && process.env[source]) || 'postgres://sycamore:sycamore@localhost:5432/sycamore';
}
