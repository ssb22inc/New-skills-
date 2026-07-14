import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestPricing } from '@/services/ai/pricing-engine'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const pricingSchema = z.object({
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10).optional(),
  sqft: z.number().int().min(100).max(50000).optional(),
  property_type: z.enum(['apartment', 'house', 'condo', 'room', 'townhouse', 'studio']).optional(),
  amenities: z.array(z.string()).max(50).optional(),
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

    const parsed = pricingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Map the snake_case API contract onto the camelCase engine input.
    // Haven listings are furnished rentals, so furnished defaults to true.
    const result = await suggestPricing({
      propertyType: parsed.data.property_type ?? 'apartment',
      bedrooms: parsed.data.bedrooms,
      bathrooms: parsed.data.bathrooms ?? 1,
      sqft: parsed.data.sqft,
      city: parsed.data.city,
      amenities: parsed.data.amenities ?? [],
      furnished: true,
    })
    return NextResponse.json({ data: result })
  } catch (error) {
    logger.error({ event: 'ai_pricing_error', error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Pricing suggestion failed' }, { status: 500 })
  }
}
