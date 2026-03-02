import { openai, MODEL } from '@/lib/openai/client'
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts'
import type { ChatMessage, OnboardingChatResult } from '@/types/ai'

export async function* streamChat(
  messages: ChatMessage[],
  systemPrompt?: string
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt || SYSTEM_PROMPTS.ONBOARDING_CHAT },
      ...messages,
    ],
    stream: true,
    max_tokens: 500,
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield content
  }
}

export async function processOnboardingMessage(
  messages: ChatMessage[],
  currentData: Record<string, unknown>
): Promise<OnboardingChatResult> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `${SYSTEM_PROMPTS.ONBOARDING_CHAT}

Current extracted data: ${JSON.stringify(currentData)}

After responding conversationally, extract any new data from the user's message.
Return JSON: { "message": "", "extracted_data": {}, "next_question": "", "is_complete": false }`,
      },
      ...messages,
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('No response from conversation engine')
  return JSON.parse(content) as OnboardingChatResult
}
