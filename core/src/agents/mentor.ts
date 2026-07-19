import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { VerticalPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';

/**
 * P28 — the Mentor. One weekly message from the seller's OWN data,
 * never generic tips. Honesty rules are structural: a suggestion cannot
 * be constructed without a data source, only vertical-pack heuristics
 * decide what is observable, and a week with nothing to say is skipped
 * — silence beats filler.
 */
export interface MentorFinding {
  signal: string;
  text: string;
  /** The internal citation — which data produced this line. */
  source: { kind: 'reviews' | 'orders' | 'catalog'; evidence: string };
}

export interface MentorMessage {
  suggestions: MentorFinding[]; // max 2
  strength: MentorFinding | null; // max 1, genuine
  message: string;
}

const PHOTO_STALE_DAYS = 60;

export function mentorService(db: Kysely<Database>, marketId: string, pack: VerticalPack) {
  return {
    /** Returns null when there is nothing worth saying this week. */
    async weeklyMessage(sellerId: string): Promise<MentorMessage | null> {
      const reviews = await db
        .selectFrom('reviews')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('status', '=', 'published')
        .where('created_at', '>', sql<Date>`now() - interval '90 days'`)
        .select(['rating', 'body'])
        .execute();

      // Only what the Vertical Pack says is observable and fixable.
      const issues: MentorFinding[] = [];
      const strengths: MentorFinding[] = [];
      for (const heuristic of pack.mentor.review_heuristics) {
        const mentions = reviews.filter((r) =>
          heuristic.keywords.some((k) => r.body.toLowerCase().includes(k.toLowerCase())),
        );
        const bad = mentions.filter((r) => r.rating <= 3);
        const good = mentions.filter((r) => r.rating >= 4);
        if (bad.length >= 2) {
          issues.push({
            signal: heuristic.signal,
            text: `${bad.length} recent reviews mention ${heuristic.signal.replace(/_/g, ' ')} — worth a look this week.`,
            source: {
              kind: 'reviews',
              evidence: `${bad.length} reviews rated ≤3 matching [${heuristic.keywords.join(', ')}]`,
            },
          });
        } else if (good.length >= 2 && bad.length === 0) {
          strengths.push({
            signal: heuristic.signal,
            text: `Customers keep praising your ${heuristic.signal.replace(/_/g, ' ')} — that is winning you repeat business.`,
            source: {
              kind: 'reviews',
              evidence: `${good.length} reviews rated ≥4 matching [${heuristic.keywords.join(', ')}]`,
            },
          });
        }
      }

      // Photo freshness closes the loop in the same chat.
      const newestPhoto = await db
        .selectFrom('catalog_items')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('active', '=', true)
        .select((eb) => eb.fn.max('updated_at').as('newest'))
        .executeTakeFirst();
      if (newestPhoto?.newest) {
        const ageDays = (Date.now() - new Date(newestPhoto.newest).getTime()) / 86_400_000;
        if (ageDays > PHOTO_STALE_DAYS) {
          issues.push({
            signal: 'photo_freshness',
            text: 'Your menu photos are getting old — send me one new photo and I will refresh everything.',
            source: {
              kind: 'catalog',
              evidence: `newest photo is ${Math.floor(ageDays)} days old`,
            },
          });
        }
      }

      // Repeat rate: a genuine strength only when the data is real.
      const repeat = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('status', '=', 'completed')
        .select(['buyer_user_id', (eb) => eb.fn.countAll().as('n')])
        .groupBy('buyer_user_id')
        .execute();
      const buyers = repeat.length;
      const repeaters = repeat.filter((r) => Number(r.n) >= 2).length;
      if (buyers >= 5 && repeaters / buyers >= 0.3) {
        strengths.push({
          signal: 'repeat_rate',
          text: `${repeaters} of your ${buyers} customers came back for more — regulars are your engine.`,
          source: {
            kind: 'orders',
            evidence: `${repeaters}/${buyers} buyers with 2+ completed orders`,
          },
        });
      }

      const suggestions = issues.slice(0, 2); // max 2, fatigue respected
      const strength = strengths[0] ?? null; // max 1, genuine
      if (suggestions.length === 0) return null; // skip-when-nothing rule

      const lines = [
        ...(strength ? [strength.text] : []),
        ...suggestions.map((s, i) => `${i + 1}. ${s.text}`),
      ];
      return { suggestions, strength, message: lines.join('\n') };
    },
  };
}

export type MentorService = ReturnType<typeof mentorService>;
