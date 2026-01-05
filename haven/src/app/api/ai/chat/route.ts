import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { processOnboardingMessage, initializeOnboardingConversation } from '@/services/ai/conversation-engine';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, conversation, type } = await request.json();

    if (type === 'onboarding') {
      const currentConversation = conversation || initializeOnboardingConversation();
      const updated = await processOnboardingMessage(currentConversation, message);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Invalid chat type' }, { status: 400 });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
