import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeMultiplePhotos } from '@/services/ai/photo-analysis';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imageUrls } = await request.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    if (imageUrls.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 images allowed' }, { status: 400 });
    }

    const analysis = await analyzeMultiplePhotos(imageUrls);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Photo analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze photos' }, { status: 500 });
  }
}
