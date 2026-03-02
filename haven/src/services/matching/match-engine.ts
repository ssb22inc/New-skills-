import { createAdminClient } from '@/lib/supabase/admin';
import { SeekerProfile, LifestyleProfile, PersonalityProfile } from '@/types/user';
import { ListingWithPhotos } from '@/types/listing';
import { MatchScore, MatchBreakdown, Match, MatchingPreferences } from '@/types/matching';

const DEFAULT_WEIGHTS = {
  lifestyle: 0.20,
  personality: 0.15,
  location: 0.25,
  budget: 0.20,
  amenity: 0.15,
  trust: 0.05,
};

export async function calculateMatchScore(
  seeker: SeekerProfile,
  listing: ListingWithPhotos | Record<string, unknown>,
  preferences?: MatchingPreferences
): Promise<{ scores: MatchScore; breakdown: MatchBreakdown }> {
  const weights = { ...DEFAULT_WEIGHTS, ...preferences?.weights };
  const listingWithPhotos = listing as ListingWithPhotos;

  const lifestyleResult = calculateLifestyleScore(seeker, listingWithPhotos);
  const personalityResult = calculatePersonalityScore(seeker);
  const locationResult = calculateLocationScore(seeker, listingWithPhotos);
  const budgetResult = calculateBudgetScore(seeker, listingWithPhotos);
  const amenityResult = calculateAmenityScore(seeker, listingWithPhotos);
  const trustResult = await calculateTrustScore(listingWithPhotos);

  if (preferences?.strict_dealbreakers && amenityResult.breakdown.dealbreaker_conflicts.length > 0) {
    return {
      scores: { total: 0, lifestyle: 0, personality: 0, location: 0, budget: 0, amenity: 0, trust: 0 },
      breakdown: {
        lifestyle: lifestyleResult.breakdown,
        personality: personalityResult.breakdown,
        location: locationResult.breakdown,
        budget: budgetResult.breakdown,
        amenity: amenityResult.breakdown,
        trust: trustResult.breakdown,
      },
    };
  }

  const total = Math.round(
    lifestyleResult.score * weights.lifestyle +
    personalityResult.score * weights.personality +
    locationResult.score * weights.location +
    budgetResult.score * weights.budget +
    amenityResult.score * weights.amenity +
    trustResult.score * weights.trust
  );

  return {
    scores: {
      total,
      lifestyle: lifestyleResult.score,
      personality: personalityResult.score,
      location: locationResult.score,
      budget: budgetResult.score,
      amenity: amenityResult.score,
      trust: trustResult.score,
    },
    breakdown: {
      lifestyle: lifestyleResult.breakdown,
      personality: personalityResult.breakdown,
      location: locationResult.breakdown,
      budget: budgetResult.breakdown,
      amenity: amenityResult.breakdown,
      trust: trustResult.breakdown,
    },
  };
}

function calculateLifestyleScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  const lifestyle = seeker.lifestyle as Partial<LifestyleProfile> | null;
  if (!lifestyle) {
    return { score: 50, breakdown: { score: 50, factors: [] } };
  }

  const factors: { name: string; score: number; explanation: string }[] = [];

  // Work-from-home workspace check
  if (lifestyle.work_from_home && listing.amenities.includes('dedicated_workspace')) {
    factors.push({ name: 'Work from home', score: 100, explanation: 'Has dedicated workspace' });
  } else if (lifestyle.work_from_home) {
    factors.push({ name: 'Work from home', score: 60, explanation: 'No dedicated workspace listed' });
  }

  // Night shift compatibility
  if (seeker.work_schedule === 'night') {
    const hasBlackoutCurtains = listing.amenities.includes('blackout_curtains');
    factors.push({
      name: 'Night shift friendly',
      score: hasBlackoutCurtains ? 90 : 50,
      explanation: hasBlackoutCurtains ? 'Has blackout curtains' : 'May need sleep accommodations',
    });
  }

  // Pet compatibility
  if (lifestyle.pet_owner) {
    const petFriendly = listing.pet_policy !== 'no_pets';
    factors.push({
      name: 'Pet friendly',
      score: petFriendly ? 100 : 0,
      explanation: petFriendly ? 'Pets allowed' : 'No pets allowed',
    });
  }

  const avgScore = factors.length > 0
    ? Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length)
    : 70;

  return { score: avgScore, breakdown: { score: avgScore, factors } };
}

function calculatePersonalityScore(seeker: SeekerProfile) {
  const personality = seeker.personality as Partial<PersonalityProfile> | null;

  if (!personality || !personality.confidence || personality.confidence < 0.5) {
    return {
      score: 70,
      breakdown: { score: 70, compatibility_type: 'unknown', explanation: 'Personality profile incomplete' },
    };
  }

  // Reliability-weighted score for landlord compatibility
  const score = Math.round(
    (personality.conscientiousness ?? 50) * 0.5 +
    (personality.agreeableness ?? 50) * 0.3 +
    (100 - (personality.neuroticism ?? 50)) * 0.2
  );

  return {
    score: Math.min(100, score),
    breakdown: {
      score: Math.min(100, score),
      compatibility_type: score >= 75 ? 'high' : score >= 55 ? 'moderate' : 'low',
      explanation: 'Based on conscientiousness and agreeableness profile',
    },
  };
}

function calculateLocationScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  const locationPrefs = seeker.location_preferences as Array<{ city: string; neighborhoods?: string[] }>;
  if (!locationPrefs || locationPrefs.length === 0) {
    return { score: 50, breakdown: { score: 50, in_preferred_area: false } };
  }

  let bestScore = 0;
  let inPreferredArea = false;

  for (const pref of locationPrefs) {
    if (pref.city?.toLowerCase() === listing.city.toLowerCase()) {
      bestScore = Math.max(bestScore, 80);

      if (pref.neighborhoods?.some((n: string) =>
        listing.neighborhood?.toLowerCase().includes(n.toLowerCase())
      )) {
        bestScore = 100;
        inPreferredArea = true;
      }
    }
  }

  return {
    score: bestScore || 30,
    breakdown: { score: bestScore || 30, in_preferred_area: inPreferredArea },
  };
}

function calculateBudgetScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  if (!seeker.budget_max) {
    return {
      score: 50,
      breakdown: {
        score: 50,
        monthly_cost: listing.price_monthly,
        percent_of_max_budget: 0,
        includes_utilities: listing.utilities_included,
      },
    };
  }

  const monthlyCost = listing.utilities_included
    ? listing.price_monthly
    : listing.price_monthly + (listing.utilities_estimate || 150);

  if (monthlyCost > seeker.budget_max) {
    const overBudgetPercent = ((monthlyCost - seeker.budget_max) / seeker.budget_max) * 100;
    const score = Math.max(0, 50 - overBudgetPercent * 2);
    return {
      score: Math.round(score),
      breakdown: {
        score: Math.round(score),
        monthly_cost: monthlyCost,
        percent_of_max_budget: Math.round((monthlyCost / seeker.budget_max) * 100),
        includes_utilities: listing.utilities_included,
      },
    };
  }

  const percentOfBudget = monthlyCost / seeker.budget_max;
  const score = percentOfBudget < 0.7 ? 85 : percentOfBudget < 0.9 ? 100 : 90;
  return {
    score,
    breakdown: {
      score,
      monthly_cost: monthlyCost,
      percent_of_max_budget: Math.round(percentOfBudget * 100),
      includes_utilities: listing.utilities_included,
    },
  };
}

function calculateAmenityScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  const mustHaves = seeker.must_haves || [];
  const niceToHaves = seeker.nice_to_haves || [];
  const listingAmenities = listing.amenities.map(a => a.toLowerCase());

  const matchedMustHaves = mustHaves.filter(m =>
    listingAmenities.some(a => a.includes(m.toLowerCase()))
  );
  const missingMustHaves = mustHaves.filter(m =>
    !listingAmenities.some(a => a.includes(m.toLowerCase()))
  );
  const matchedNiceToHaves = niceToHaves.filter(n =>
    listingAmenities.some(a => a.includes(n.toLowerCase()))
  );

  const dealbreakerConflicts: string[] = [];

  const mustHaveScore = mustHaves.length > 0
    ? (matchedMustHaves.length / mustHaves.length) * 70
    : 70;
  const niceToHaveScore = niceToHaves.length > 0
    ? (matchedNiceToHaves.length / niceToHaves.length) * 30
    : 30;

  const score = dealbreakerConflicts.length > 0 ? 0 : Math.round(mustHaveScore + niceToHaveScore);

  return {
    score,
    breakdown: {
      score,
      matched_must_haves: matchedMustHaves,
      missing_must_haves: missingMustHaves,
      matched_nice_to_haves: matchedNiceToHaves,
      dealbreaker_conflicts: dealbreakerConflicts,
    },
  };
}

async function calculateTrustScore(listing: ListingWithPhotos) {
  const landlord = listing.landlord;
  let score = 50;

  if (landlord?.response_rate && landlord.response_rate > 90) score += 20;
  else if (landlord?.response_rate && landlord.response_rate > 70) score += 10;

  return {
    score: Math.min(100, score),
    breakdown: {
      score: Math.min(100, score),
      landlord_verified: false,
      landlord_rating: undefined,
      response_rate: landlord?.response_rate,
    },
  };
}

export async function findMatchesForSeeker(
  seekerId: string,
  options?: { limit?: number; offset?: number; minScore?: number }
): Promise<Match[]> {
  const supabase = createAdminClient();

  const { data: seekerProfile } = await supabase
    .from('seeker_profiles')
    .select('*')
    .eq('id', seekerId)
    .single();

  if (!seekerProfile) throw new Error('Seeker profile not found');

  const { data: listings } = await supabase
    .from('listings')
    .select(`*, listing_photos(*), profiles!listings_user_id_fkey(id, full_name, avatar_url)`)
    .eq('status', 'active')
    .limit(options?.limit || 50);

  if (!listings) return [];

  const matches: Match[] = [];

  for (const listing of listings) {
    const { scores, breakdown } = await calculateMatchScore(
      seekerProfile as SeekerProfile,
      listing as unknown as ListingWithPhotos
    );

    if (scores.total >= (options?.minScore || 30)) {
      matches.push({
        id: `${seekerId}-${listing.id}`,
        listing: listing as unknown as ListingWithPhotos,
        scores,
        breakdown,
        created_at: new Date().toISOString(),
      });
    }
  }

  matches.sort((a, b) => b.scores.total - a.scores.total);
  return matches.slice(0, options?.limit || 20);
}
