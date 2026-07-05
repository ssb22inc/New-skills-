import { z } from 'zod';

/**
 * Vertical Pack: everything industry-specific. Same law as Context Packs:
 * every field required, unknown keys rejected, no silent defaults.
 */

export const CompletionProofSchema = z.enum(['buyer_confirm', 'qr_scan', 'geo_checkin']);

export const VerticalPackSchema = z
  .object({
    vertical_id: z.string().regex(/^[a-z_]+$/, 'expected a lowercase vertical id like "food"'),
    name: z.string().min(1),
    capacity: z
      .object({
        unit_singular: z.string().min(1),
        unit_plural: z.string().min(1),
        time_granularity_minutes: z.number().int().positive(),
      })
      .strict(),
    booking: z
      .object({
        /** Basis points (2000 = 20.00%) — integer money math only. */
        deposit_default_bps: z.number().int().min(0).max(10000),
        completion_proof: z.array(CompletionProofSchema).min(1),
      })
      .strict(),
    mentor: z
      .object({
        /** Review-mining heuristics: what the Mentor may observe and advise on. */
        review_heuristics: z
          .array(
            z
              .object({
                signal: z.string().min(1),
                keywords: z.array(z.string().min(1)).min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  })
  .strict();

export type VerticalPack = z.infer<typeof VerticalPackSchema>;
export type CompletionProof = z.infer<typeof CompletionProofSchema>;
