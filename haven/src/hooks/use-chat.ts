'use client';

import { useState, useCallback } from 'react';
import { OnboardingConversation } from '@/types/ai';

export function useChat(type: 'onboarding' | 'listing' = 'onboarding') {
  const [conversation, setConversation] = useState<OnboardingConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation, type }),
      });

      if (!res.ok) throw new Error('Failed to send message');

      const updated = await res.json();
      setConversation(updated);
      return updated;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [conversation, type]);

  const reset = useCallback(() => {
    setConversation(null);
    setError(null);
  }, []);

  return { conversation, loading, error, sendMessage, reset };
}
