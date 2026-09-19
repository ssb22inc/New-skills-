/**
 * THE GREEN-BUILD GUARD.
 *
 * The 2026-07-25 audit found the most dangerous thing in the repo, and
 * it was not in any prompt: 35 test files are wrapped in
 * `describe.runIf(reachable)` so they skip when Postgres is unreachable.
 * That is right for a laptop with no Docker running. It is catastrophic
 * in CI, because a Postgres service that fails to start turns the
 * oversell storm, the 10,000-op ledger fuzz, and every drill into
 * "skipped" — and `vitest run` exits 0. Proven at the time: with the
 * database stopped, the storm suite reported "1 skipped" and exit 0.
 *
 * So CI sets SYCAMORE_REQUIRE_DB=1, and this test refuses to pass
 * without a live database. A skipped money gate can no longer look like
 * a passing one.
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { databaseUrl } from '@sycamore/core';

async function postgresReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const required = process.env.SYCAMORE_REQUIRE_DB === '1';
const reachable = await postgresReachable();

describe('CI integrity — the gates must actually run', () => {
  it.runIf(required)('Postgres is reachable, so no integration gate is silently skipped', () => {
    expect(
      reachable,
      'SYCAMORE_REQUIRE_DB=1 but Postgres is unreachable at ' +
        `${databaseUrl().replace(/:[^:@]*@/, ':***@')}.\n` +
        'Every integration gate — oversell storm, ledger fuzz, blackout drill, ' +
        'eviction drill — would have been SKIPPED and this build would have ' +
        'gone green without testing a single one of them. Failing instead.',
    ).toBe(true);
  });

  it('states plainly which mode this run is in', () => {
    // Not an assertion about the world — a line in the log so nobody has
    // to guess afterwards whether a green run proved anything.
    const mode = required ? 'REQUIRED (CI)' : 'optional (local)';
    console.info(
      `Database mode: ${mode}; Postgres ${
        reachable ? 'reachable' : 'UNREACHABLE — ' + 'integration gates will skip'
      }`,
    );
    expect(typeof required).toBe('boolean');
  });
});
