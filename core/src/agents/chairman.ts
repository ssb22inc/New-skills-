import type { Kysely } from 'kysely';
import { sql } from 'kysely';
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

export function chairmanService(db: Kysely<Database>, marketId: string) {
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
        'Weekly memo — what held up in testing:',
        ...tested.map((i) => `• ${i.statement} [${i.evidence}]`),
        ...(probes.length > 0
          ? ['Small probes worth a try:', ...probes.map((i) => `• ${i.statement}`)]
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
