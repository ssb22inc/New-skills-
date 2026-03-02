import { openai, VISION_MODEL } from '@/lib/openai/client'
import { SYSTEM_PROMPTS, buildPhotoAnalysisPrompt } from '@/lib/openai/prompts'
import type { PhotoAnalysisResult } from '@/types/ai'

export async function analyzePhoto(
  imageUrl: string,
  roomHint?: string
): Promise<PhotoAnalysisResult> {
  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.PHOTO_ANALYZER },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPhotoAnalysisPrompt(roomHint) },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('No response from photo analysis')
  return JSON.parse(content) as PhotoAnalysisResult
}

export async function analyzeMultiplePhotos(
  imageUrls: string[]
): Promise<PhotoAnalysisResult[]> {
  return Promise.all(imageUrls.map((url) => analyzePhoto(url)))
}
