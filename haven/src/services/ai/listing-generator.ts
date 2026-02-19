import { openai, createEmbedding } from '@/lib/openai/client';
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts';
import { GeneratedListing, PhotoAnalysis } from '@/types/listing';

interface ListingInput {
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  city: string;
  state: string;
  neighborhood?: string;
  amenities: string[];
  photo_analysis?: PhotoAnalysis[];
  landlord_notes?: string;
  nearby_hospitals?: string[];
  commute_times?: Record<string, number>;
}

export async function generateListing(input: ListingInput): Promise<GeneratedListing> {
  const photoContext = input.photo_analysis
    ? `Photo analysis shows: ${input.photo_analysis.map(p =>
        `${p.detected_room}: ${p.features.join(', ')}`
      ).join('. ')}`
    : '';

  const hospitalContext = input.nearby_hospitals?.length
    ? `Nearby hospitals: ${input.nearby_hospitals.join(', ')}`
    : '';

  const prompt = `Create a compelling listing for this property:

Property: ${input.bedrooms}BR/${input.bathrooms}BA ${input.property_type}
Location: ${input.neighborhood || ''} ${input.city}, ${input.state}
Size: ${input.sqft ? `${input.sqft} sqft` : 'Not specified'}
Amenities: ${input.amenities.join(', ')}
${photoContext}
${hospitalContext}
${input.landlord_notes ? `Additional notes from landlord: ${input.landlord_notes}` : ''}

Create JSON with:
{
  "title": "catchy title under 80 chars",
  "headline": "one-line hook under 150 chars",
  "description": "detailed 200-300 word description",
  "amenities": ["refined list of amenities"],
  "highlights": ["top 5 selling points"],
  "seo_title": "SEO optimized title",
  "seo_description": "160 char meta description"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.LISTING_GENERATOR },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content || '{}');
}

export async function generateListingEmbedding(listing: {
  title: string;
  description: string;
  amenities: string[];
  city: string;
  neighborhood?: string;
}): Promise<number[]> {
  const text = [
    listing.title,
    listing.description,
    `Amenities: ${listing.amenities.join(', ')}`,
    `Location: ${listing.neighborhood || ''} ${listing.city}`,
  ].join('\n');

  return createEmbedding(text);
}
