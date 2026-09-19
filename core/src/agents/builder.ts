import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AlertSink } from '../observability/alerts.js';
import type { FlagsRepo } from '../flags/flags.js';
import { canaryRelease } from '../canary/canary.js';
import { emitEvent } from '../db/outbox.js';

/**
 * P29 — the Builder. An agent-authored change ships ONLY through the
 * full proof chain: sandbox tests → simulation → 5% canary → founder
 * tap → 72h auto-rollback armed. Failing any stage stops the pipeline
 * dead; nothing later runs, and the record says exactly where it died.
 */
export type BuilderStage = 'sandbox' | 'simulation' | 'canary' | 'founder_tap' | 'shipped';

export interface AgentChange {
  id: string;
  title: string;
  /** One plain sentence for the founder tap (thumbs-up governance). */
  summary: string;
  flagKey: string;
  sandboxTests: () => Promise<boolean>;
  simulate: () => Promise<boolean>;
  /** Health probe used by the canary AND the 72h rollback watch. */
  healthCheck: () => Promise<boolean>;
}

export interface BuilderRun {
  changeId: string;
  outcome: 'shipped' | 'stopped';
  stoppedAt?: BuilderStage;
  /** When the armed auto-rollback watch expires (shipped runs only). */
  rollbackArmedUntil?: Date;
}

const ROLLBACK_WINDOW_MS = 72 * 3_600_000;

export function builderPipeline(deps: {
  db: Kysely<Database>;
  marketId: string;
  flags: FlagsRepo;
  alert: AlertSink;
  /** The founder's tap. Injected — the Builder can never tap for them. */
  founderApproves: (summary: string) => Promise<boolean>;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  async function record(changeId: string, stage: BuilderStage, passed: boolean) {
    await emitEvent(deps.db, {
      marketId: deps.marketId,
      topic: 'builder.stage',
      payload: { changeId, stage, passed },
    });
  }

  return {
    async run(change: AgentChange): Promise<BuilderRun> {
      // Stage 1 — sandbox tests.
      if (!(await change.sandboxTests().catch(() => false))) {
        await record(change.id, 'sandbox', false);
        return { changeId: change.id, outcome: 'stopped', stoppedAt: 'sandbox' };
      }
      await record(change.id, 'sandbox', true);

      // Stage 2 — simulation against recorded traffic.
      if (!(await change.simulate().catch(() => false))) {
        await record(change.id, 'simulation', false);
        return { changeId: change.id, outcome: 'stopped', stoppedAt: 'simulation' };
      }
      await record(change.id, 'simulation', true);

      // Stage 3 — 5% canary with automatic rollback (P6 machinery).
      const canary = await canaryRelease({
        flags: deps.flags,
        alert: deps.alert,
        flagKey: change.flagKey,
        version: change.id,
        description: change.title,
        healthCheck: change.healthCheck,
      });
      if (!canary.promoted) {
        await record(change.id, 'canary', false);
        return { changeId: change.id, outcome: 'stopped', stoppedAt: 'canary' };
      }
      await record(change.id, 'canary', true);

      // Stage 4 — the founder tap. Declined = fully rolled back.
      if (!(await deps.founderApproves(change.summary))) {
        await deps.flags.set({
          key: change.flagKey,
          enabled: false,
          rolloutBps: 0,
          description: `${change.title} (declined by founder)`,
        });
        await record(change.id, 'founder_tap', false);
        return { changeId: change.id, outcome: 'stopped', stoppedAt: 'founder_tap' };
      }
      await record(change.id, 'founder_tap', true);
      await record(change.id, 'shipped', true);
      return {
        changeId: change.id,
        outcome: 'shipped',
        rollbackArmedUntil: new Date(now().getTime() + ROLLBACK_WINDOW_MS),
      };
    },

    /**
     * The armed watch: inside the 72h window a failing health probe
     * rolls the change back automatically and pages the founder.
     */
    async rollbackWatch(change: AgentChange, run: BuilderRun): Promise<'held' | 'rolled_back'> {
      if (run.outcome !== 'shipped' || !run.rollbackArmedUntil) return 'held';
      if (now() > run.rollbackArmedUntil) return 'held'; // window expired
      if (await change.healthCheck().catch(() => false)) return 'held';
      await deps.flags.set({
        key: change.flagKey,
        enabled: false,
        rolloutBps: 0,
        description: `${change.title} (auto-rollback inside 72h window)`,
      });
      await deps.alert.send(
        `🔴 Auto-rollback: "${change.title}" went unhealthy inside its 72h watch window ` +
          `and has been switched off. Nothing for you to do — reviewing it is on me.`,
      );
      await record(change.id, 'shipped', false);
      return 'rolled_back';
    },
  };
}

export type BuilderPipeline = ReturnType<typeof builderPipeline>;
