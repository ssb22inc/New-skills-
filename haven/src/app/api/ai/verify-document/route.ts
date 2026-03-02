import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyDocument } from '@/services/ai/document-verification'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { imageUrl, documentType } = await request.json()
    if (!imageUrl || !documentType) {
      return NextResponse.json({ error: 'imageUrl and documentType required' }, { status: 400 })
    }

    const result = await verifyDocument(imageUrl, documentType)
    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document verification failed' },
      { status: 500 }
    )
  }
}
