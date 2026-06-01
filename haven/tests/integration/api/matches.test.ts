import { describe, it, expect } from 'vitest';

describe('Matches API', () => {
  describe('GET /api/matches', () => {
    it('returns matches for authenticated user', async () => {
      const response = await fetch('/api/matches');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.matches).toBeDefined();
      expect(Array.isArray(data.matches)).toBe(true);
    });

    it('respects limit parameter', async () => {
      const response = await fetch('/api/matches?limit=5');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.matches.length).toBeLessThanOrEqual(5);
    });

    it('filters by minimum score', async () => {
      const response = await fetch('/api/matches?minScore=70');
      const data = await response.json();

      expect(response.status).toBe(200);
      data.matches.forEach((match: any) => {
        expect(match.scores.total).toBeGreaterThanOrEqual(70);
      });
    });

    it('includes score breakdown', async () => {
      const response = await fetch('/api/matches');
      const data = await response.json();

      expect(response.status).toBe(200);
      if (data.matches.length > 0) {
        const match = data.matches[0];
        expect(match.scores).toBeDefined();
        expect(match.scores.total).toBeDefined();
        expect(match.scores.lifestyle).toBeDefined();
        expect(match.breakdown).toBeDefined();
      }
    });
  });

  describe('POST /api/matches', () => {
    it('records like action', async () => {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: 'listing-123',
          action: 'liked',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.seeker_action).toBe('liked');
    });

    it('records skip action', async () => {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: 'listing-123',
          action: 'skipped',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.seeker_action).toBe('skipped');
    });
  });
});
