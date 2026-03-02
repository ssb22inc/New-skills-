import { openai, MODEL } from '@/lib/openai/client'
import { SYSTEM_PROMPTS, buildListingPrompt } from '@/lib/openai/prompts'
import type { ListingGenerationResult } from '@/types/ai'

interface GenerateListingInput {
  propertyType: string
  bedrooms: number
  bathrooms: number
  sqft?: number
  amenities: string[]
  neighborhood: string
  city: string
  targetDemographic?: string
}

export async function generateListingContent(
  input: GenerateListingInput
): Promise<ListingGenerationResult> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.LISTING_GENERATOR },
      { role: 'user', content: buildListingPrompt(input) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('No response from listing generator')
  return JSON.parse(content) as ListingGenerationResult
}
