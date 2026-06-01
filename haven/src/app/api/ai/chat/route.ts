import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  processOnboardingMessage,
  initializeOnboardingConversation,
  streamChat,
} from '@/services/ai/conversation-engine';
import { OnboardingConversation } from '@/types/ai';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const MAX_MESSAGE_LENGTH = 4000;   // ~1k tokens
const MAX_HISTORY_MESSAGES = 50;   // prevent token exhaustion from long histories

const chatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stream'),
    stream: z.literal(true),
    conversation: z.object({
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(MAX_MESSAGE_LENGTH),
      })).max(MAX_HISTORY_MESSAGES).optional().default([]),
    }).optional(),
  }),
  z.object({
    type: z.literal('onboarding'),
    stream: z.literal(false).optional(),
    message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
    conversation: z.any().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Normalise legacy callers that pass stream:true without a type field
    if (typeof body === 'object' && body !== null && !('type' in body)) {
      (body as Record<string, unknown>).type = (body as Record<string, unknown>).stream ? 'stream' : 'onboarding';
    }

    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.type === 'stream') {
      const messages = data.conversation?.messages ?? [];
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamChat(messages)) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });
      return new Response(readableStream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Structured onboarding mode
    const currentConversation: OnboardingConversation =
      data.conversation || initializeOnboardingConversation();
    const updated = await processOnboardingMessage(currentConversation, data.message);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ event: 'ai_chat_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
