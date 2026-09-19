/**
 * The database URL resolver. A deploy went dark on 2026-09-09 because the
 * secret was on the host under a different name than the one the code
 * read; this pins the names we accept and the order they win in.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DATABASE_URL_NAMES,
  databaseUrl,
  databaseUrlSource,
  describeDatabaseUrl,
} from './database.js';

const saved = new Map<string, string | undefined>();
function setEnv(name: string, value: string | undefined): void {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe('databaseUrl — where the connection string comes from', () => {
  it('falls back to the dev default when nothing is set', () => {
    for (const name of DATABASE_URL_NAMES) setEnv(name, undefined);
    expect(databaseUrlSource()).toBeUndefined();
    expect(databaseUrl()).toBe('postgres://sycamore:sycamore@localhost:5432/sycamore');
  });

  it('accepts the names hosted integrations write, DATABASE_URL first', () => {
    for (const name of DATABASE_URL_NAMES) setEnv(name, undefined);
    setEnv('POSTGRES_URL', 'postgres://pooled');
    setEnv('POSTGRES_URL_NON_POOLING', 'postgres://direct');
    expect(databaseUrlSource()).toBe('POSTGRES_URL');
    expect(databaseUrl()).toBe('postgres://pooled');

    setEnv('DATABASE_URL', 'postgres://ours');
    expect(databaseUrlSource()).toBe('DATABASE_URL');
    expect(databaseUrl()).toBe('postgres://ours');
  });

  it('treats an empty value as unset — Vercel saves blanks as empty strings', () => {
    for (const name of DATABASE_URL_NAMES) setEnv(name, undefined);
    setEnv('DATABASE_URL', '');
    setEnv('SUPABASE_DB_URL', 'postgres://supabase');
    expect(databaseUrlSource()).toBe('SUPABASE_DB_URL');
    expect(databaseUrl()).toBe('postgres://supabase');
  });
});

describe('describeDatabaseUrl — enough to diagnose, never enough to connect', () => {
  // Obviously fake. A real credential must never enter the repository,
  // not even as a fixture: this file is public.
  const secret = 'not-a-real-password';

  it('drops the password and masks the project reference', () => {
    const pooled = `postgresql://sycamore.guwnrztetamljfodlybs:${secret}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`;
    const shape = describeDatabaseUrl(pooled);
    expect(shape).not.toContain(secret);
    expect(shape).toBe(
      'sycamore.guwn\u2026lybs@aws-1-us-east-1.pooler.supabase.com:6543/postgres sslmode=require',
    );
  });

  it('masks the reference in a direct Supabase host too', () => {
    const direct = `postgres://postgres:${secret}@db.guwnrztetamljfodlybs.supabase.co:5432/postgres`;
    const shape = describeDatabaseUrl(direct);
    expect(shape).not.toContain(secret);
    expect(shape).toBe('postgres@db.guwn\u2026lybs.supabase.co:5432/postgres');
  });

  it('says so plainly when the value is not a connection string at all', () => {
    // What gets pasted when the dashboard's placeholder is copied whole.
    expect(describeDatabaseUrl('[YOUR-PASSWORD]')).toBe('not a connection string (15 characters)');
  });

  it('names percent-encoding when raw punctuation breaks the URL', () => {
    const shape = describeDatabaseUrl('postgres://sycamore:p@ss:word/#?@localhost:5432/sycamore');
    expect(shape).toContain('must be percent-encoded');
    expect(shape).not.toContain('ss:word');
  });

  it('never echoes a password that parses, whatever it contains', () => {
    for (const password of ['hunter2', '%25%25', encodeURIComponent('a b@c'), secret]) {
      const url = `postgres://sycamore:${password}@localhost:5432/sycamore`;
      expect(describeDatabaseUrl(url)).toBe('sycamore@localhost:5432/sycamore');
    }
  });
});
