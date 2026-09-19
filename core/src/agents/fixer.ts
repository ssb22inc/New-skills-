import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';
import { RUNBOOK_ACTIONS, type Runbook, type RunbookAction } from './runbooks.js';

export class FixerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixerError';
  }
}

/**
 * The Fixer's hands: infrastructure hooks for the four allow-listed
 * verbs. Injected so tests (and drills) observe exactly what ran.
 */
export type ActionExecutor = (action: RunbookAction, incident: { vital: string }) => Promise<void>;

/**
 * P27 — Fixer executes runbook-only actions. A known fault (a runbook
 * matches the incident's vital + direction) self-heals; ANYTHING novel
 * pages the founder and provably never improvises: no runbook, no
 * action, no exceptions — §5.9.
 */
export function fixerService(db: Kysely<Database>, marketId: string, runbooks: Runbook[]) {
  return {
    async handle(incidentId: string, execute: ActionExecutor) {
      const incident = await db
        .selectFrom('agent_incidents')
        .where('market_id', '=', marketId)
        .where('id', '=', incidentId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (incident.status !== 'open') throw new FixerError('incident already handled');

      const runbook = runbooks.find(
        (r) => r.trigger.vital === incident.vital && r.trigger.direction === incident.direction,
      );

      if (!runbook) {
        // Novel anomaly: escalate, touch nothing.
        await db
          .updateTable('agent_incidents')
          .set({ status: 'escalated', updated_at: sql`now()` })
          .where('id', '=', incidentId)
          .execute();
        await emitEvent(db, {
          marketId,
          topic: 'agents.page_founder',
          payload: {
            incidentId,
            vital: incident.vital,
            direction: incident.direction,
            reason: 'novel anomaly — no runbook matches; Fixer does not improvise',
          },
        });
        return { outcome: 'escalated' as const, actions: [] as RunbookAction[] };
      }

      // Belt and braces: the loader already rejects unknown verbs, but a
      // runbook object handed in by code gets re-checked at the moment of
      // execution. This line is the improvisation firewall.
      for (const action of runbook.actions) {
        if (!RUNBOOK_ACTIONS.includes(action)) {
          throw new FixerError(`action "${action as string}" is not in the runbook allow-list`);
        }
      }

      for (const action of runbook.actions) {
        await execute(action, { vital: incident.vital });
        await db
          .insertInto('agent_actions')
          .values({
            market_id: marketId,
            incident_id: incidentId,
            action,
            runbook_id: runbook.id,
            runbook_version: runbook.version,
          })
          .execute();
      }
      await db
        .updateTable('agent_incidents')
        .set({ status: 'healed', runbook_id: runbook.id, updated_at: sql`now()` })
        .where('id', '=', incidentId)
        .execute();
      await emitEvent(db, {
        marketId,
        topic: 'agents.incident_healed',
        payload: { incidentId, runbookId: runbook.id, runbookVersion: runbook.version },
      });
      return { outcome: 'healed' as const, actions: [...runbook.actions] };
    },
  };
}

export type FixerService = ReturnType<typeof fixerService>;
