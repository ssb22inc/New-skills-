import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { translator, type ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';

export class ChairmanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChairmanError';
  }
}

/**
 * P30 — the Chairman. Full READ access, zero spend authority: this
 * service is constructed without the ledger and owns no mutation —
 * everything it produces is a report. The weekly memo obeys the
 * tested-items-only rule; small probe asks are allowed but capped.
 */
export interface MemoItem {
  statement: string;
  kind: 'tested' | 'probe';
  /** Required for tested items: the test/metric that backs the claim. */
  evidence?: string | undefined;
}

const MAX_PROBES_PER_MEMO = 2;

/** Vitals snapshot + incident state → should the founder wake up NOW? */
export interface WakeInput {
  escalatedIncidents: number;
  paymentSuccessRate: number | null;
  ledgerDriftMinor: number;
}

export function chairmanService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const say = translator(pack);
  return {
    /** Tested-items-only: every claim cites its test; probes are capped. */
    weeklyMemo(items: MemoItem[]): string {
      for (const item of items) {
        if (item.kind === 'tested' && !item.evidence) {
          throw new ChairmanError(
            `memo item "${item.statement}" has no evidence — tested-items-only rule`,
          );
        }
      }
      const probes = items.filter((i) => i.kind === 'probe');
      if (probes.length > MAX_PROBES_PER_MEMO) {
        throw new ChairmanError(
          `${probes.length} probe asks in one memo — the cap is ${MAX_PROBES_PER_MEMO}`,
        );
      }
      const tested = items.filter((i) => i.kind === 'tested');
      return [
        say('chairman.memo_header'),
        ...tested.map((i) => `• ${i.statement} [${i.evidence}]`),
        ...(probes.length > 0
          ? [say('chairman.probes_header'), ...probes.map((i) => `• ${i.statement}`)]
          : []),
      ].join('\n');
    },

    /** Agent report cards from the audit record — reads only. */
    async reportCards() {
      const incidents = await db
        .selectFrom('agent_incidents')
        .where('market_id', '=', marketId)
        .select(['status', (eb) => eb.fn.countAll().as('n')])
        .groupBy('status')
        .execute();
      const byStatus = Object.fromEntries(incidents.map((r) => [r.status, Number(r.n)]));
      const actions = await db
        .selectFrom('agent_actions')
        .where('market_id', '=', marketId)
        .select((eb) => eb.fn.countAll().as('n'))
        .executeTakeFirst();
      const builderStages = await db
        .selectFrom('events_outbox')
        .where('market_id', '=', marketId)
        .where('topic', '=', 'builder.stage')
        .select([
          sql<string>`payload->>'stage'`.as('stage'),
          sql<string>`payload->>'passed'`.as('passed'),
        ])
        .execute();
      // The remaining crew keep their record in the same two places:
      // their own tables, or the outbox. A report card with no record
      // behind it is theatre, so every number below is a row somewhere.
      const surveys = await db
        .selectFrom('surveys')
        .where('market_id', '=', marketId)
        .select(['thumbs_up', (eb) => eb.fn.countAll().as('n')])
        .groupBy('thumbs_up')
        .execute();
      const thumbsUp = Number(surveys.find((r) => r.thumbs_up)?.n ?? 0);
      const thumbsDown = Number(surveys.find((r) => !r.thumbs_up)?.n ?? 0);

      const radar = await db
        .selectFrom('radar_items')
        .where('market_id', '=', marketId)
        .select(['status', (eb) => eb.fn.countAll().as('n')])
        .groupBy('status')
        .execute();
      const radarBy = Object.fromEntries(radar.map((r) => [r.status, Number(r.n)]));

      const counts = async (topic: string) =>
        Number(
          (
            await db
              .selectFrom('events_outbox')
              .where('market_id', '=', marketId)
              .where('topic', '=', topic)
              .select((eb) => eb.fn.countAll().as('n'))
              .executeTakeFirst()
          )?.n ?? 0,
        );
      const bursarRuns = await db
        .selectFrom('events_outbox')
        .where('market_id', '=', marketId)
        .where('topic', '=', 'bursar.review')
        .select([
          sql<string>`payload->>'proposed'`.as('proposed'),
          sql<string>`payload->>'blocked'`.as('blocked'),
        ])
        .execute();
      const heraldPilots = await db
        .selectFrom('events_outbox')
        .where('market_id', '=', marketId)
        .where('topic', '=', 'herald.pilot')
        .select([sql<string>`payload->>'lift'`.as('lift')])
        .execute();

      return {
        watchman: {
          incidentsOpened:
            (byStatus['open'] ?? 0) + (byStatus['healed'] ?? 0) + (byStatus['escalated'] ?? 0),
        },
        fixer: {
          healed: byStatus['healed'] ?? 0,
          escalated: byStatus['escalated'] ?? 0,
          actionsExecuted: Number(actions?.n ?? 0),
        },
        builder: {
          shipped: builderStages.filter((s) => s.stage === 'shipped' && s.passed === 'true').length,
          stopped: builderStages.filter((s) => s.passed === 'false').length,
        },
        listener: {
          surveysSent: await counts('listener.survey_sent'),
          thumbsUp,
          thumbsDown,
        },
        scout: { cleared: radarBy['cleared'] ?? 0, parked: radarBy['parked'] ?? 0 },
        mentor: { messagesSent: await counts('mentor.message_sent') },
        bursar: {
          reviews: bursarRuns.length,
          proposed: bursarRuns.reduce((s, r) => s + Number(r.proposed ?? 0), 0),
          blockedOnDpa: bursarRuns.reduce((s, r) => s + Number(r.blocked ?? 0), 0),
        },
        herald: {
          pilots: heraldPilots.length,
          bestLift:
            heraldPilots.length === 0
              ? 0
              : Math.max(...heraldPilots.map((p) => Number(p.lift ?? 0))),
        },
      };
    },

    /** The wake-trigger ruleset: page the founder only for these. */
    wakeCheck(input: WakeInput): { wake: boolean; reasons: string[] } {
      const reasons: string[] = [];
      if (input.escalatedIncidents > 0) {
        reasons.push(`${input.escalatedIncidents} escalated incident(s) awaiting a human`);
      }
      if (input.paymentSuccessRate !== null && input.paymentSuccessRate < 0.8) {
        reasons.push(`payment success at ${(input.paymentSuccessRate * 100).toFixed(0)}%`);
      }
      if (input.ledgerDriftMinor !== 0) {
        reasons.push(
          `ledger drift of ${input.ledgerDriftMinor} minor units — a single cent blocks release`,
        );
      }
      return { wake: reasons.length > 0, reasons };
    },
  };
}

export type ChairmanService = ReturnType<typeof chairmanService>;
