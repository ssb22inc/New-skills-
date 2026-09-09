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

/** Dev default matches docker-compose.yml / .env.example. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://sycamore:sycamore@localhost:5432/sycamore';
}
