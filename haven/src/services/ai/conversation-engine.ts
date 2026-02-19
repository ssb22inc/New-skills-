import { openai } from '@/lib/openai/client';
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts';
import { ConversationMessage, OnboardingConversation } from '@/types/ai';

export async function processOnboardingMessage(
  conversation: OnboardingConversation,
  userMessage: string
): Promise<OnboardingConversation> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPTS.SEEKER_ONBOARDING },
    ...conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content || '{}');

  // Merge extracted data
  const updatedExtractedData = {
    ...conversation.extracted_data,
    ...parsed.extracted_data,
  };

  // Update conversation
  return {
    messages: [
      ...conversation.messages,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: parsed.message, timestamp: new Date().toISOString() },
    ],
    extracted_data: updatedExtractedData,
    current_topic: parsed.current_topic || conversation.current_topic,
    completion_percentage: parsed.completion_percentage || conversation.completion_percentage,
  };
}

export function initializeOnboardingConversation(): OnboardingConversation {
  return {
    messages: [
      {
        role: 'assistant',
        content: "Hi! I'm here to help you find the perfect housing for your assignment. Let's start with the basics - what's your profession and where will you be working?",
        timestamp: new Date().toISOString(),
      },
    ],
    extracted_data: {},
    current_topic: 'introduction',
    completion_percentage: 0,
  };
}

export async function generateProfileSummary(extractedData: OnboardingConversation['extracted_data']): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'Summarize this housing seeker profile in a brief, friendly paragraph.',
      },
      {
        role: 'user',
        content: JSON.stringify(extractedData),
      },
    ],
    max_tokens: 200,
  });

  return response.choices[0].message.content || '';
}
