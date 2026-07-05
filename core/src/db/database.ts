import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 10 }),
    }),
  });
}

/** Dev default matches docker-compose.yml / .env.example. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://sycamore:sycamore@localhost:5432/sycamore';
}
