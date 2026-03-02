import { openai, MODEL } from '@/lib/openai/client'
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts'
import type { VoiceToListingResult } from '@/types/ai'

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  })

  return transcription.text
}

export async function voiceToListing(transcription: string): Promise<VoiceToListingResult> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.VOICE_PROCESSOR },
      {
        role: 'user',
        content: `Extract listing details from this description:\n\n"${transcription}"\n\nReturn JSON with extracted_data, confidence (0-1), and missing_info array.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('No response from voice processor')
  return JSON.parse(content) as VoiceToListingResult
}
