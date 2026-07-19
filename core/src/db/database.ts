import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

export function createDb(connectionString: string): Kysely<Database> {
  const pool = new pg.Pool({ connectionString, max: 10 });
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
