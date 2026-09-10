import type { AsrAdapter, AsrResult } from './types.js';

/** Fixture-keyed ASR used by all tests: audioRef → canned transcript. */
export function mockAsr(fixtures: Record<string, string>): AsrAdapter {
  return {
    id: 'mock-asr',
    transcribe(audioRef: string): Promise<AsrResult> {
      const text = fixtures[audioRef];
      if (text === undefined) {
        return Promise.reject(new Error(`mock-asr: no fixture for "${audioRef}"`));
      }
      return Promise.resolve({ text, confidence: 0.9 });
    },
  };
}
