'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useChat } from '@/hooks/use-chat';
import { LoadingSpinner } from '@/components/common/loading-spinner';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

interface SeekerChatProps {
  seekerId: string;
  onComplete?: (preferences: any) => void;
  initialMessage?: string;
}

export function SeekerChat({
  seekerId,
  onComplete,
  initialMessage = "Hi! I'm here to help you find your perfect housing. Let's start by learning about your needs and preferences. What brings you to our platform?",
}: SeekerChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: initialMessage,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { sendMessage, isLoading } = useChat({
    conversationId: `onboarding-${seekerId}`,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await sendMessage(input.trim(), {
        context: 'onboarding',
        seekerId,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Check if onboarding is complete
      if (response.metadata?.onboardingComplete) {
        onComplete?.(response.metadata.preferences);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I'm having trouble responding right now. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">Haven AI Assistant</h3>
          <p className="text-xs text-muted-foreground">
            Here to help you find your perfect home
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {/* Avatar */}
            <Avatar
              className={`h-8 w-8 shrink-0 ${
                message.role === 'assistant' ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              {message.role === 'assistant' ? (
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              ) : (
                <span className="text-sm font-semibold text-gray-700">You</span>
              )}
            </Avatar>

            {/* Message Bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {message.content}
              </p>
              <span
                className={`text-xs mt-1 block ${
                  message.role === 'user'
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0 bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </Avatar>
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.4s' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="lg"
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Quick Replies (optional) */}
      <div className="px-4 pb-4 flex flex-wrap gap-2">
        {messages.length === 1 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setInput("I'm a travel nurse looking for temporary housing")
              }
            >
              Travel nurse
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInput("I need housing near a hospital")}
            >
              Near hospital
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInput("Looking for furnished apartments")}
            >
              Furnished
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
