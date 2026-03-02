import { openai, VISION_MODEL } from '@/lib/openai/client';
import { SYSTEM_PROMPTS } from '@/lib/openai/prompts';
import { PhotoAnalysis } from '@/types/listing';

export async function analyzePhoto(imageUrl: string): Promise<PhotoAnalysis> {
  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.PHOTO_ANALYZER },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          { type: 'text', text: 'Analyze this rental property photo.' },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content || '{}');
}

export async function analyzeMultiplePhotos(imageUrls: string[]): Promise<{
  photos: PhotoAnalysis[];
  overall: {
    condition_score: number;
    style: string;
    highlights: string[];
    concerns: string[];
  };
}> {
  const photoAnalyses = await Promise.all(imageUrls.map(analyzePhoto));

  const avgCondition = photoAnalyses.reduce((sum, p) => sum + p.condition_score, 0) / photoAnalyses.length;
  const styles = photoAnalyses.map(p => p.style).filter(Boolean) as string[];
  const dominantStyle = findMostCommon(styles) || 'mixed';
  const allFeatures = photoAnalyses.flatMap(p => p.features);
  const allIssues = photoAnalyses.flatMap(p => p.quality_issues);

  return {
    photos: photoAnalyses,
    overall: {
      condition_score: Math.round(avgCondition * 10) / 10,
      style: dominantStyle,
      highlights: [...new Set(allFeatures)].slice(0, 10),
      concerns: [...new Set(allIssues)],
    },
  };
}

function findMostCommon(arr: string[]): string | undefined {
  const counts = arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}
