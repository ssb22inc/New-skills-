import type { AsrAdapter, LlmRouter } from '@sycamore/adapters';
import type { ContextPack } from '@sycamore/packs';
import { detectIntent, type Intent } from '../conversations/intents.js';
import { applyGlossary, type GlossaryStore } from './glossary.js';

export interface VoiceIntentResult {
  transcript: string;
  corrected: string;
  intent: Intent;
}

/**
 * P12 — the voice pipeline: voice note → ASR → glossary corrections
 * (founder-approved only) → intent. Intent accuracy is the metric that
 * matters; word accuracy is not the gate.
 */
export function voicePipeline(deps: {
  asr: AsrAdapter;
  router: LlmRouter;
  pack: ContextPack;
  glossary: GlossaryStore;
}) {
  return {
    async voiceNoteToIntent(audioRef: string): Promise<VoiceIntentResult> {
      const { text: transcript } = await deps.asr.transcribe(audioRef);
      const corrected = applyGlossary(transcript, await deps.glossary.approvedEntries());
      const intent = await detectIntent(deps.router, deps.pack, corrected);
      return { transcript, corrected, intent };
    },
  };
}

export type VoicePipeline = ReturnType<typeof voicePipeline>;
