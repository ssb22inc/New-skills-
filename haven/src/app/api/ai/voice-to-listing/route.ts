import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio, voiceToListing } from '@/services/ai/voice-processing'
import { logger } from '@/lib/logger'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB (OpenAI Whisper limit)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const audio = formData.get('audio') as Blob | null

    if (!audio) {
      return NextResponse.json({ error: 'Audio file required' }, { status: 400 })
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file too large (max 25 MB)' }, { status: 413 })
    }

    const transcription = await transcribeAudio(audio)
    const result = await voiceToListing(transcription)

    return NextResponse.json({ data: { transcription, ...result } })
  } catch (error) {
    logger.error({ event: 'ai_voice_error', error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Voice processing failed' }, { status: 500 })
  }
}
