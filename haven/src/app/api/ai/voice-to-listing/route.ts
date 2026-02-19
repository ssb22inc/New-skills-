import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { transcribeAudio } from '@/lib/openai/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const text = await transcribeAudio(buffer);

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Voice transcription error:', error);
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}
