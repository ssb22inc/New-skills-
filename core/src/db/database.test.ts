/**
 * The database URL resolver. A deploy went dark on 2026-09-09 because the
 * secret was on the host under a different name than the one the code
 * read; this pins the names we accept and the order they win in.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_URL_NAMES, databaseUrl, databaseUrlSource } from './database.js';

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
