import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';

export interface GlossaryEntry {
  heard: string;
  meant: string;
}

export function glossaryStore(db: Kysely<Database>, marketId: string) {
  return {
    /** Anyone may propose; only founder approval makes it live. */
    async propose(heard: string, meant: string): Promise<void> {
      await db
        .insertInto('asr_glossary')
        .values({ market_id: marketId, heard: heard.toLowerCase(), meant })
        .onConflict((oc) =>
          oc.columns(['market_id', 'heard']).doUpdateSet({ meant, updated_at: sql`now()` }),
        )
        .execute();
    },

    async approve(heard: string): Promise<void> {
      await db
        .updateTable('asr_glossary')
        .set({ approved: true, updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('heard', '=', heard.toLowerCase())
        .execute();
    },

    /** Only APPROVED corrections are ever applied. */
    async approvedEntries(): Promise<GlossaryEntry[]> {
      const rows = await db
        .selectFrom('asr_glossary')
        .where('market_id', '=', marketId)
        .where('approved', '=', true)
        .select(['heard', 'meant'])
        .execute();
      return rows;
    },
  };
}

/** Word-boundary replacement, longest phrases first, case-insensitive. */
export function applyGlossary(text: string, entries: GlossaryEntry[]): string {
  let result = text;
  const sorted = [...entries].sort((a, b) => b.heard.length - a.heard.length);
  for (const { heard, meant } of sorted) {
    const escaped = heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), meant);
  }
  return result;
}

export type GlossaryStore = ReturnType<typeof glossaryStore>;
