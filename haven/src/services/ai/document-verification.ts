import { openai, VISION_MODEL } from '@/lib/openai/client'
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts'
import type { DocumentVerificationResult } from '@/types/ai'

export async function verifyDocument(
  imageUrl: string,
  documentType: string
): Promise<DocumentVerificationResult> {
  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.DOCUMENT_VERIFIER },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Verify this ${documentType} document. Check for authenticity indicators. Extract relevant data (name, income if applicable, employer, date). Do NOT store or expose sensitive numbers like SSN. Return JSON: { "is_authentic": boolean, "confidence": 0-1, "document_type": "", "extracted_data": {}, "flags": [] }`,
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('No response from document verifier')
  return JSON.parse(content) as DocumentVerificationResult
}
