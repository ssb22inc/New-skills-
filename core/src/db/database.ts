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

/**
 * A one-line, safe-to-display summary of a connection string: who it
 * connects as, to which host, port and database. THE PASSWORD IS NEVER
 * PART OF THE RESULT, and a Supabase project reference — which appears
 * in both the direct host and the pooler username — is masked to its
 * first and last four characters.
 *
 * This exists because "password authentication failed for user
 * postgres" is only half a diagnosis: the other half is which URL the
 * deployment is actually using, and the founder cannot read a secret
 * back out of a host's dashboard. The shape is enough to see that a
 * direct host was pasted instead of the pooler, or the project's own
 * superuser instead of the app role.
 */
export function describeDatabaseUrl(url: string = databaseUrl()): string {
  const mask = (ref: string): string =>
    ref.length > 10 ? `${ref.slice(0, 4)}\u2026${ref.slice(-4)}` : ref;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Two different mistakes, two different sentences. A value with no
    // scheme is usually the dashboard's placeholder pasted whole; a
    // value that has one but will not parse is almost always a password
    // containing punctuation that has to be percent-encoded first.
    return url.includes('://')
      ? `unparseable connection string (${url.length} characters) — a password containing ` +
          '@ : / ? or # must be percent-encoded'
      : `not a connection string (${url.length} characters)`;
  }
  // A pooler username is "<role>.<project ref>"; mask the ref only.
  const user = decodeURIComponent(parsed.username).replace(
    /^([^.]+)\.(.+)$/,
    (_m, role: string, ref: string) => `${role}.${mask(ref)}`,
  );
  const host = parsed.hostname.replace(
    /^db\.([a-z0-9]+)\.supabase\.co$/,
    (_m, ref: string) => `db.${mask(ref)}.supabase.co`,
  );
  const port = parsed.port || '5432';
  const database = parsed.pathname.replace(/^\//, '') || '(none)';
  const ssl = parsed.searchParams.get('sslmode');
  return `${user || '(no user)'}@${host}:${port}/${database}${ssl ? ` sslmode=${ssl}` : ''}`;
}

/** Dev default matches docker-compose.yml / .env.example. */
export function databaseUrl(): string {
  const source = databaseUrlSource();
  return (source && process.env[source]) || 'postgres://sycamore:sycamore@localhost:5432/sycamore';
}
