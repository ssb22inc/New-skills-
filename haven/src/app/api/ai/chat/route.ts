import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  processOnboardingMessage,
  initializeOnboardingConversation,
  streamChat,
} from '@/services/ai/conversation-engine';
import { OnboardingConversation } from '@/types/ai';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, conversation, type, stream } = await request.json();

    // Streaming mode (used by simple chat UI)
    if (stream) {
      const messages = conversation?.messages ?? [];
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
    if (type === 'onboarding') {
      const currentConversation: OnboardingConversation =
        conversation || initializeOnboardingConversation();
      const updated = await processOnboardingMessage(currentConversation, message);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Invalid chat type' }, { status: 400 });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
