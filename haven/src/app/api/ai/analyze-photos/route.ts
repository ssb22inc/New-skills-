import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeMultiplePhotos } from '@/services/ai/photo-analysis';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const analyzePhotosSchema = z.object({
  imageUrls: z.array(z.string().url().max(2048)).min(1).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = analyzePhotosSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const analysis = await analyzeMultiplePhotos(parsed.data.imageUrls);
    return NextResponse.json(analysis);
  } catch (error) {
    logger.error({ event: 'ai_analyze_photos_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to analyze photos' }, { status: 500 });
  }
}
