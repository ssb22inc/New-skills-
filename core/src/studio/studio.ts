import type { AsrAdapter, ImagePolishAdapter, LlmRouter, VideoAdapter } from '@sycamore/adapters';
import type { ContextPack } from '@sycamore/packs';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';

export class StudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioError';
  }
}

/**
 * Compliance is CODE, not a prompt (P25): offer terms present, no banned
 * claims, disclosure rules. A failing option never reaches the seller.
 */
export const BANNED_CLAIMS = [
  /\bcure[sd]?\b/i,
  /\bguaranteed (profit|returns?|winnings)\b/i,
  /\b100% (safe|effective)\b/i,
  /\bmiracle\b/i,
  /\bno risk\b/i,
];

export interface ComplianceResult {
  ok: boolean;
  problems: string[];
}

export function complianceCheck(copy: string, pack: ContextPack): ComplianceResult {
  const problems: string[] = [];
  // Offer terms: a concrete price in the market currency must be present.
  if (!copy.includes(pack.currency.symbol)) {
    problems.push(`offer terms missing: no ${pack.currency.symbol} price in the copy`);
  }
  for (const banned of BANNED_CLAIMS) {
    if (banned.test(copy)) problems.push(`banned claim matched: ${banned}`);
  }
  // Disclosure: paid promotion must say so.
  if (!/\b(ad|sponsored|promotion)\b/i.test(copy)) {
    problems.push('disclosure missing: the copy must be labeled as an ad/promotion');
  }
  return { ok: problems.length === 0, problems };
}

export interface AdOption {
  copy: string;
  imageRef: string;
  videoRef: string;
}

export interface StudioDeps {
  db: Kysely<Database>;
  asr: AsrAdapter;
  router: LlmRouter;
  imagePolish: ImagePolishAdapter;
  video: VideoAdapter;
  pack: ContextPack;
}

/**
 * P25 — speak-to-create: voice note → brief → polish REAL photos only →
 * short video → dialect copy → compliance → 3 options → 👍 → publish.
 */
export function studioPipeline(deps: StudioDeps, marketId: string) {
  return {
    async createAd(input: {
      sellerId: string;
      voiceNoteRef: string;
      sourcePhotoRefs: string[];
    }): Promise<{ brief: string; options: AdOption[]; startedAt: number }> {
      const startedAt = Date.now();

      // THE permanent check: no source photo, no ad. Nothing is generated.
      if (input.sourcePhotoRefs.length === 0) {
        throw new StudioError(
          'no fabricated product imagery — send at least one real photo of the product',
        );
      }

      const { text: transcript } = await deps.asr.transcribe(input.voiceNoteRef);
      const briefRes = await deps.router.complete({
        task: 'creative',
        system: 'Turn the seller voice note into a one-line ad brief: offer, price, when.',
        prompt: transcript,
        containsPii: false,
      });
      const brief = briefRes.text.trim();

      const polished = await Promise.all(
        input.sourcePhotoRefs.map((ref) => deps.imagePolish.polish(ref, brief)),
      );
      const imageRefs = polished.map((p) => p.polishedRef);
      const { videoRef } = await deps.video.shortVideo(imageRefs, brief);

      // Three dialect copy options; regenerate non-compliant ones once,
      // then drop what still fails — a bad option NEVER reaches the seller.
      const options: AdOption[] = [];
      for (let i = 0; i < 3; i++) {
        let copy = '';
        for (let attempt = 0; attempt < 2 && options.length < 3; attempt++) {
          const res = await deps.router.complete({
            task: 'creative',
            system:
              `Write ONE short ad in the market voice. It MUST include the price with ` +
              `${deps.pack.currency.symbol}, the offer terms, and the word "Ad" as a label. ` +
              `Market directives:\n` +
              deps.pack.language.copy_directives.map((d) => `- ${d}`).join('\n'),
            prompt: `brief: ${brief}; variant: ${i}; attempt: ${attempt}`,
            containsPii: false,
          });
          copy = res.text.trim();
          if (complianceCheck(copy, deps.pack).ok) break;
          copy = '';
        }
        if (copy) {
          options.push({ copy, imageRef: imageRefs[0]!, videoRef });
        }
      }
      if (options.length === 0) {
        throw new StudioError('no compliant ad option could be produced — human review needed');
      }
      return { brief, options, startedAt };
    },

    /** 👍 — the seller taps one option and it publishes. */
    async approve(input: {
      sellerId: string;
      option: AdOption;
      startedAt: number;
    }): Promise<{ publishedInMs: number }> {
      const compliance = complianceCheck(input.option.copy, deps.pack);
      if (!compliance.ok) {
        throw new StudioError(`refusing to publish: ${compliance.problems.join('; ')}`);
      }
      await emitEvent(deps.db, {
        marketId,
        topic: 'studio.ad_published',
        payload: {
          sellerId: input.sellerId,
          copy: input.option.copy,
          imageRef: input.option.imageRef,
          videoRef: input.option.videoRef,
        },
      });
      return { publishedInMs: Date.now() - input.startedAt };
    },
  };
}

export type StudioPipeline = ReturnType<typeof studioPipeline>;
