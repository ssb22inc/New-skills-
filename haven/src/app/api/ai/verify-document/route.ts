import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyDocument } from '@/services/ai/document-verification'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const ALLOWED_DOC_TYPES = ['drivers_license', 'passport', 'national_id', 'pay_stub', 'bank_statement'] as const

const verifyDocSchema = z.object({
  imageUrl: z.string().url().max(2048),
  documentType: z.enum(ALLOWED_DOC_TYPES),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = verifyDocSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const result = await verifyDocument(parsed.data.imageUrl, parsed.data.documentType)
    return NextResponse.json({ data: result })
  } catch (error) {
    logger.error({ event: 'ai_verify_doc_error', error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Document verification failed' }, { status: 500 })
  }
}
