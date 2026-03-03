import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateMatchScore } from '@/services/matching/match-engine';
import { createMockSeekerProfile, createMockListing } from '../../mocks/data';

describe('Match Engine', () => {
  describe('calculateMatchScore', () => {
    it('calculates total score from weighted components', async () => {
      const seeker = createMockSeekerProfile({
        budget_min: 1500,
        budget_max: 2500,
        location_preferences: [{ city: 'Houston', state: 'TX' }],
        must_haves: ['wifi'],
        lifestyle: { work_from_home: false, cleanliness: 8 },
      });

      const listing = createMockListing({
        city: 'Houston',
        state: 'TX',
        price_monthly: 2000,
        amenities: ['wifi', 'parking'],
        utilities_included: false,
      });

      const result = await calculateMatchScore(seeker, listing as any);

      expect(result.scores.total).toBeGreaterThan(0);
      expect(result.scores.total).toBeLessThanOrEqual(100);
      expect(result.breakdown).toBeDefined();
    });

    it('gives high location score for matching city', async () => {
      const seeker = createMockSeekerProfile({
        location_preferences: [{ city: 'Houston', state: 'TX', neighborhoods: ['Midtown'] }],
      });

      const listing = createMockListing({
        city: 'Houston',
        state: 'TX',
        neighborhood: 'Midtown',
      });

      const result = await calculateMatchScore(seeker, listing as any);

      expect(result.scores.location).toBeGreaterThanOrEqual(80);
    });

    it('gives low location score for non-matching city', async () => {
      const seeker = createMockSeekerProfile({
        location_preferences: [{ city: 'Houston', state: 'TX' }],
      });

      const listing = createMockListing({
        city: 'Dallas',
        state: 'TX',
      });

      const result = await calculateMatchScore(seeker, listing as any);

      expect(result.scores.location).toBeLessThan(50);
    });

    it('calculates budget score correctly when within budget', async () => {
      const seeker = createMockSeekerProfile({
        budget_min: 1500,
        budget_max: 2500,
      });

      const listing = createMockListing({
        price_monthly: 2000,
        utilities_included: true,
      });

      const result = await calculateMatchScore(seeker, listing as any);

      expect(result.scores.budget).toBeGreaterThanOrEqual(80);
      expect(result.breakdown.budget.percent_of_max_budget).toBe(80);
    });

    it('penalizes over-budget listings', async () => {
      const seeker = createMockSeekerProfile({
        budget_max: 2000,
      });

      const listing = createMockListing({
        price_monthly: 2500,
        utilities_included: false,
        utilities_estimate: 150,
      });

      const result = await calculateMatchScore(seeker, listing as any);

      expect(result.scores.budget).toBeLessThan(50);
    });

    it('includes matched must-haves in amenity breakdown', async () => {
      const seeker = createMockSeekerProfile({
        must_haves: ['wifi', 'parking'],
        nice_to_haves: ['gym'],
      });

      const listing = createMockListing({
        amenities: ['wifi', 'parking', 'pool'],
      });

      const result = await calculateMatchScore(seeker, listing as any);

      expect(result.breakdown.amenity.matched_must_haves).toContain('wifi');
      expect(result.breakdown.amenity.matched_must_haves).toContain('parking');
      expect(result.breakdown.amenity.missing_must_haves).toHaveLength(0);
    });

    it('uses custom weights when provided', async () => {
      const seeker = createMockSeekerProfile();
      const listing = createMockListing();

      const result = await calculateMatchScore(seeker, listing as any, {
        weights: {
          location: 0.5,
          budget: 0.3,
          lifestyle: 0.1,
          personality: 0.05,
          amenity: 0.05,
          trust: 0,
        },
      });

      expect(result.scores.total).toBeDefined();
    });
  });
});
