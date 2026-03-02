'use client';

import { useState, useCallback } from 'react';
import { OnboardingConversation } from '@/types/ai';

export function useChat(type: 'onboarding' | 'listing' = 'onboarding') {
  const [conversation, setConversation] = useState<OnboardingConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (message: string) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, conversation, type }),
        });

        if (!res.ok) throw new Error('Failed to send message');

        const updated: OnboardingConversation = await res.json();
        setConversation(updated);
        return updated;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [conversation, type]
  );

  const reset = useCallback(() => {
    setConversation(null);
    setError(null);
  }, []);

  const lastAssistantMessage = conversation?.messages
    .filter(m => m.role === 'assistant')
    .at(-1)?.content;

  const extractedData = conversation?.extracted_data ?? {};
  const completionPercentage = conversation?.completion_percentage ?? 0;

  return {
    conversation,
    loading,
    error,
    sendMessage,
    reset,
    lastAssistantMessage,
    extractedData,
    completionPercentage,
  };
}
