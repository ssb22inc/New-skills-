import { z } from 'zod';

/**
 * Context Pack: everything geography-specific. Every field is REQUIRED —
 * a missing field is a load error, never a silent default (CLAUDE.md data
 * rules). Schemas are strict: unknown keys are load errors too, so typos
 * can't silently ship.
 */

const HolidaySchema = z
  .object({
    name: z.string().min(1),
    /** Fixed date as MM-DD. */
    date: z
      .string()
      .regex(/^\d{2}-\d{2}$/, 'expected MM-DD')
      .optional(),
    /** Movable-date rule, e.g. "easter-2", "easter+1", "third-monday-october". */
    rule: z.string().min(1).optional(),
  })
  .strict()
  .refine((h) => (h.date !== undefined) !== (h.rule !== undefined), {
    message: 'exactly one of "date" or "rule" is required',
  });

export const ContextPackSchema = z
  .object({
    market_id: z.string().regex(/^[a-z]{2}$/, 'expected a two-letter market id like "jm"'),
    name: z.string().min(1),
    language: z
      .object({
        primary: z.string().min(1),
        dialect: z.string().min(1),
        /** Directives fed to the localization engine — the voice of the market. */
        copy_directives: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    currency: z
      .object({
        code: z.string().length(3),
        symbol: z.string().min(1),
        /** Minor-unit exponent (JMD: 2 → 100 cents per dollar). */
        exponent: z.number().int().min(0).max(4),
      })
      .strict(),
    timezone: z.string().min(1),
    calendar: z
      .object({
        holidays: z.array(HolidaySchema).min(1),
      })
      .strict(),
    channels: z
      .object({
        primary: z.string().min(1),
        fallbacks: z.array(z.string().min(1)),
      })
      .strict(),
    payments: z
      .object({
        providers: z
          .array(
            z
              .object({
                id: z.string().min(1),
                kind: z.enum(['wallet', 'card', 'bank']),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    compliance: z
      .object({
        data_protection: z
          .object({
            law: z.string().min(1),
            /** PII may only route to vendors with a signed DPA (hard policy, P4). */
            dpa_signature_required: z.boolean(),
          })
          .strict(),
        /** Counsel-confirmed per market at pack launch (BUILD §7). */
        marketplace_facilitator_collection: z.boolean(),
      })
      .strict(),
    tax: z
      .object({
        gct_registration_threshold: z
          .object({
            /** Integer minor units — money rules apply to packs too. */
            amount_minor: z.number().int().positive(),
            currency: z.string().length(3),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type ContextPack = z.infer<typeof ContextPackSchema>;
