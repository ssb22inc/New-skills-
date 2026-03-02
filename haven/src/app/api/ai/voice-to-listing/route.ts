import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio, voiceToListing } from '@/services/ai/voice-processing'

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

    const transcription = await transcribeAudio(audio)
    const result = await voiceToListing(transcription)

    return NextResponse.json({ data: { transcription, ...result } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Voice processing failed' },
      { status: 500 }
    )
  }
}
