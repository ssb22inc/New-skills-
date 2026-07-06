import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';

export interface FeatureFlag {
  marketId: string;
  key: string;
  enabled: boolean;
  /** 0–10000; 500 = 5% canary. */
  rolloutBps: number;
  description: string;
}

/**
 * Typed flag accessor, market-scoped like everything else. Rollout is a
 * stable hash of (key, subject): a subject stays in or out of the canary
 * cohort across evaluations — no flapping mid-session.
 */
export function flagsRepo(db: Kysely<Database>, marketId: string) {
  return {
    async set(input: {
      key: string;
      enabled: boolean;
      rolloutBps: number;
      description: string;
    }): Promise<void> {
      await db
        .insertInto('feature_flags')
        .values({
          market_id: marketId,
          key: input.key,
          enabled: input.enabled,
          rollout_bps: input.rolloutBps,
          description: input.description,
        })
        .onConflict((oc) =>
          oc.columns(['market_id', 'key']).doUpdateSet({
            enabled: input.enabled,
            rollout_bps: input.rolloutBps,
            description: input.description,
            updated_at: sql`now()`,
          }),
        )
        .execute();
    },

    async get(key: string): Promise<FeatureFlag | undefined> {
      const row = await db
        .selectFrom('feature_flags')
        .where('market_id', '=', marketId)
        .where('key', '=', key)
        .selectAll()
        .executeTakeFirst();
      if (!row) return undefined;
      return {
        marketId: row.market_id,
        key: row.key,
        enabled: row.enabled,
        rolloutBps: row.rollout_bps,
        description: row.description,
      };
    },
  };
}

export type FlagsRepo = ReturnType<typeof flagsRepo>;

/** Deterministic cohort assignment: same subject, same answer, always. */
export function isEnabledFor(flag: FeatureFlag | undefined, subjectId: string): boolean {
  if (!flag || !flag.enabled || flag.rolloutBps === 0) return false;
  if (flag.rolloutBps >= 10000) return true;
  const digest = createHash('sha256').update(`${flag.key}:${subjectId}`).digest();
  const bucket = digest.readUInt16BE(0) % 10000;
  return bucket < flag.rolloutBps;
}
