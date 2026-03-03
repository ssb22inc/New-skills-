import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzePhoto, analyzeMultiplePhotos } from '@/services/ai/photo-analysis';
import { openai } from '@/lib/openai/client';

vi.mock('@/lib/openai/client', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

describe('Photo Analysis Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzePhoto', () => {
    it('returns analysis for a single photo', async () => {
      const mockResponse = {
        detected_room: 'living_room',
        features: ['sofa', 'tv', 'natural_light'],
        condition_score: 8,
        quality_score: 9,
        quality_issues: [],
        suggested_caption: 'Spacious living room with natural light',
      };

      vi.mocked(openai.chat.completions.create).mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      } as any);

      const result = await analyzePhoto('https://example.com/photo.jpg');

      expect(result.detected_room).toBe('living_room');
      expect(result.features).toContain('sofa');
      expect(result.condition_score).toBe(8);
    });

    it('handles API errors gracefully', async () => {
      vi.mocked(openai.chat.completions.create).mockRejectedValue(new Error('API Error'));

      await expect(analyzePhoto('https://example.com/photo.jpg')).rejects.toThrow('API Error');
    });
  });

  describe('analyzeMultiplePhotos', () => {
    it('analyzes multiple photos and calculates overall metrics', async () => {
      const mockResponses = [
        { detected_room: 'living_room', features: ['sofa'], condition_score: 8, quality_score: 9, quality_issues: [], style: 'modern' },
        { detected_room: 'bedroom', features: ['bed'], condition_score: 7, quality_score: 8, quality_issues: [], style: 'modern' },
        { detected_room: 'kitchen', features: ['appliances'], condition_score: 9, quality_score: 9, quality_issues: [], style: 'modern' },
      ];

      let callCount = 0;
      vi.mocked(openai.chat.completions.create).mockImplementation(() => {
        return Promise.resolve({
          choices: [{ message: { content: JSON.stringify(mockResponses[callCount++]) } }],
        } as any);
      });

      const result = await analyzeMultiplePhotos([
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
      ]);

      expect(result.photos).toHaveLength(3);
      expect(result.overall.condition_score).toBe(8); // Average of 8, 7, 9
      expect(result.overall.style).toBe('modern');
      expect(result.overall.highlights).toContain('sofa');
    });
  });
});
