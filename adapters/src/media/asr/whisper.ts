import type { AsrAdapter, AsrResult } from './types.js';

export interface WhisperOptions {
  /** Self-hosted whisper endpoint (BUILD: ASR is self-hosted). */
  baseUrl: string;
  model?: string;
  /** Fetches the audio bytes for a channel media reference. */
  fetchAudio: (audioRef: string) => Promise<Uint8Array<ArrayBuffer>>;
}

/** Self-hosted Whisper adapter (OpenAI-compatible transcription route). */
export function whisperAsr(options: WhisperOptions): AsrAdapter {
  return {
    id: 'whisper-selfhosted',
    async transcribe(audioRef: string): Promise<AsrResult> {
      const audio = await options.fetchAudio(audioRef);
      const form = new FormData();
      form.set('file', new Blob([audio], { type: 'audio/ogg' }), 'note.ogg');
      form.set('model', options.model ?? 'whisper-1');
      const res = await fetch(`${options.baseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error(`whisper transcription failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { text: string };
      return { text: body.text };
    },
  };
}
