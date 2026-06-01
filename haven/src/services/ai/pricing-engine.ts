import { openai, MODEL } from '@/lib/openai/client'
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts'
import type { PricingSuggestion } from '@/types/ai'

interface PricingInput {
  propertyType: string
  bedrooms: number
  bathrooms: number
  sqft?: number
  city: string
  neighborhood?: string
  amenities: string[]
  furnished: boolean
  availableDate?: string
}

export async function suggestPricing(
  input: PricingInput,
  marketData?: unknown
): Promise<PricingSuggestion> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.PRICING_ADVISOR },
      {
        role: 'user',
        content: `Suggest monthly rental pricing for:
- ${input.bedrooms}BD/${input.bathrooms}BA ${input.propertyType} in ${input.neighborhood ? input.neighborhood + ', ' : ''}${input.city}
- ${input.sqft ? input.sqft + ' sqft, ' : ''}${input.furnished ? 'furnished' : 'unfurnished'}
- Amenities: ${input.amenities.join(', ')}
${marketData ? `\nMarket data: ${JSON.stringify(marketData)}` : ''}

Return JSON: { "suggested_price": number, "price_range": { "min": number, "max": number }, "confidence": 0-1, "market_percentile": 0-100, "reasoning": "", "comparables": [] }`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('No response from pricing engine')
  return JSON.parse(content) as PricingSuggestion
}
