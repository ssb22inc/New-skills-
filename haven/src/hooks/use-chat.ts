'use client'

import { useState, useCallback } from 'react'
import type { ChatMessage } from '@/types/ai'

export function useChat(initialMessages: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (content: string, context?: Record<string, unknown>) => {
      const userMessage: ChatMessage = { role: 'user', content }
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            context,
          }),
        })

        if (!res.ok) throw new Error('Failed to send message')

        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ''

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '' },
        ])

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          assistantContent += decoder.decode(value, { stream: true })
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: assistantContent },
          ])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setIsLoading(false)
      }
    },
    [messages]
  )

  const clearMessages = useCallback(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  return { messages, isLoading, error, sendMessage, clearMessages }
}
