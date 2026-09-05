/**
 * THE ROLLBACK SCRIPT (P6).
 *
 * Automatic rollback has always been code — `canaryRelease` watches a
 * change and pulls it back on failure without anybody awake. This is the
 * other half: the thing a founder runs at 2am when the automation did
 * not catch it, on a phone, without reading the codebase first.
 *
 *   pnpm rollback --list                        # what is shipped
 *   pnpm rollback --flag pulse_autoscale        # pull it back to 0%
 *   pnpm rollback --flag pulse_autoscale --market do
 *   pnpm rollback --all                         # every flag to 0%, one market
 *
 * It does exactly one thing: set rollout to 0% and disable. It never
 * deletes a flag (history is evidence), never touches money, and never
 * touches a market you did not name. Every run prints what changed and
 * writes an outbox event, so the morning after has a record.
 */
import { createDb, databaseUrl, emitEvent, flagsRepo, marketsRegistry } from '@sycamore/core';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

const db = createDb(databaseUrl());

async function main(): Promise<number> {
  const market = arg('market') ?? 'jm';
  if ((await marketsRegistry(db).statusOf(market)) === undefined) {
    console.error(`unknown market "${market}"`);
    return 1;
  }
  const flags = flagsRepo(db, market);

  if (has('list') || process.argv.length <= 2) {
    const all = await flags.list();
    if (all.length === 0) {
      console.info(`no flags in "${market}"`);
      return 0;
    }
    console.info(`flags in "${market}":`);
    for (const f of all) {
      const pct = (f.rolloutBps / 100).toFixed(2);
      console.info(
        `  ${f.enabled ? '●' : '○'} ${f.key.padEnd(28)} ${pct.padStart(6)}%  ${f.description}`,
      );
    }
    console.info(`\nrollback one:  pnpm rollback --flag <key> --market ${market}`);
    return 0;
  }

  const targets = has('all')
    ? (await flags.list()).filter((f) => f.enabled || f.rolloutBps > 0).map((f) => f.key)
    : [arg('flag')].filter((k): k is string => Boolean(k));

  if (targets.length === 0) {
    console.error('nothing to roll back — pass --flag <key> or --all');
    return 1;
  }

  let rolledBack = 0;
  let notFound = 0;
  for (const key of targets) {
    const before = await flags.get(key);
    if (!before) {
      console.error(`  ✗ ${key}: no such flag in "${market}"`);
      notFound++;
      continue;
    }
    await flags.set({
      key,
      enabled: false,
      rolloutBps: 0,
      description: before.description,
    });
    // The record matters more than the console line: the Chairman's
    // memo and the cockpit both read the outbox.
    await emitEvent(db, {
      marketId: market,
      topic: 'canary.rolled_back',
      payload: {
        key,
        by: 'operator',
        wasEnabled: before.enabled,
        wasRolloutBps: before.rolloutBps,
      },
    });
    rolledBack++;
    console.info(
      `  ✓ ${key}: ${before.enabled ? 'on' : 'off'} @ ${(before.rolloutBps / 100).toFixed(2)}% → off @ 0%`,
    );
  }
  console.info(`\nrolled back ${rolledBack} flag(s) in "${market}". Money was not touched.`);
  // Naming a flag that does not exist is an operator error at 2am — say
  // so with an exit code, do not let it look like a successful rollback.
  return notFound > 0 ? 1 : 0;
}

const code = await main();
await db.destroy();
process.exit(code);
