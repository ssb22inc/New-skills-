import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeMultiplePhotos } from '@/services/ai/photo-analysis'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { imageUrls } = await request.json()
    if (!imageUrls || !Array.isArray(imageUrls)) {
      return NextResponse.json({ error: 'imageUrls array required' }, { status: 400 })
    }

    const results = await analyzeMultiplePhotos(imageUrls)
    return NextResponse.json({ data: results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Photo analysis failed' },
      { status: 500 }
    )
  }
}
