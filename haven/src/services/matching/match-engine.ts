import { createServerSupabaseClient } from '@/lib/supabase/server';
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
  listing: ListingWithPhotos,
  preferences?: MatchingPreferences
): Promise<{ scores: MatchScore; breakdown: MatchBreakdown }> {
  const weights = { ...DEFAULT_WEIGHTS, ...preferences?.weights };

  // Calculate individual scores
  const lifestyleResult = calculateLifestyleScore(seeker, listing);
  const personalityResult = calculatePersonalityScore(seeker, listing);
  const locationResult = calculateLocationScore(seeker, listing);
  const budgetResult = calculateBudgetScore(seeker, listing);
  const amenityResult = calculateAmenityScore(seeker, listing);
  const trustResult = await calculateTrustScore(listing);

  // Check dealbreakers
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

  // Calculate weighted total
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
  const lifestyle = seeker.lifestyle as LifestyleProfile | null;
  if (!lifestyle) {
    return { score: 50, breakdown: { score: 50, factors: [] } };
  }

  const factors: { name: string; score: number; explanation: string }[] = [];

  // Work schedule compatibility with property
  if (lifestyle.work_from_home && listing.amenities.includes('dedicated_workspace')) {
    factors.push({ name: 'Work from home', score: 100, explanation: 'Has dedicated workspace' });
  } else if (lifestyle.work_from_home) {
    factors.push({ name: 'Work from home', score: 60, explanation: 'No dedicated workspace listed' });
  }

  // Night shift compatibility
  if (seeker.work_schedule === 'night') {
    const hasBlackoutCurtains = listing.amenities.includes('blackout_curtains');
    const quietNeighborhood = listing.neighborhood?.toLowerCase().includes('quiet');
    factors.push({
      name: 'Night shift friendly',
      score: hasBlackoutCurtains || quietNeighborhood ? 90 : 50,
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

function calculatePersonalityScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  const personality = seeker.personality as PersonalityProfile | null;
  if (!personality) {
    return { score: 50, breakdown: { score: 50, compatibility_type: 'unknown', explanation: 'Personality not assessed' } };
  }

  // For private rentals, personality match is less critical
  // Could expand this for roommate matching
  const score = 70;

  return {
    score,
    breakdown: {
      score,
      compatibility_type: 'neutral',
      explanation: 'Private rental - personality less relevant',
    },
  };
}

function calculateLocationScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  const locationPrefs = seeker.location_preferences as any[];
  if (!locationPrefs || locationPrefs.length === 0) {
    return { score: 50, breakdown: { score: 50, in_preferred_area: false } };
  }

  let bestMatch = 0;
  let inPreferredArea = false;

  for (const pref of locationPrefs) {
    if (pref.city?.toLowerCase() === listing.city.toLowerCase()) {
      bestMatch = Math.max(bestMatch, 80);

      if (pref.neighborhoods?.some((n: string) =>
        listing.neighborhood?.toLowerCase().includes(n.toLowerCase())
      )) {
        bestMatch = 100;
        inPreferredArea = true;
      }
    }
  }

  return {
    score: bestMatch || 30,
    breakdown: {
      score: bestMatch || 30,
      in_preferred_area: inPreferredArea,
    },
  };
}

function calculateBudgetScore(seeker: SeekerProfile, listing: ListingWithPhotos) {
  if (!seeker.budget_max) {
    return { score: 50, breakdown: { score: 50, monthly_cost: listing.price_monthly, percent_of_max_budget: 0, includes_utilities: listing.utilities_included } };
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
  // Best score around 70-90% of budget
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
  const dealbreakers = seeker.dealbreakers || [];
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

  // Check dealbreakers
  const dealbreakerConflicts: string[] = [];
  for (const db of dealbreakers) {
    const dbLower = db.toLowerCase();
    if (dbLower.includes('no pet') && listing.pet_policy === 'no_pets') continue;
    if (dbLower.includes('smoke') && listing.smoking_policy === 'no_smoking') continue;
    // Add more dealbreaker logic as needed
  }

  // Calculate score
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

  // Add more trust factors: verified landlord, reviews, etc.

  return {
    score: Math.min(100, score),
    breakdown: {
      score: Math.min(100, score),
      landlord_verified: false, // Would check verification status
      landlord_rating: undefined,
      response_rate: landlord?.response_rate,
    },
  };
}

export async function findMatchesForSeeker(
  seekerId: string,
  options?: { limit?: number; offset?: number; minScore?: number }
): Promise<Match[]> {
  const supabase = await createServerSupabaseClient();

  // Get seeker profile
  const { data: seekerProfile } = await supabase
    .from('seeker_profiles')
    .select('*')
    .eq('id', seekerId)
    .single();

  if (!seekerProfile) throw new Error('Seeker profile not found');

  // Get active listings
  const { data: listings } = await supabase
    .from('listings')
    .select(`
      *,
      photos:listing_photos(*),
      landlord:profiles!listings_user_id_fkey(
        id, full_name, avatar_url
      )
    `)
    .eq('status', 'active')
    .limit(options?.limit || 50);

  if (!listings) return [];

  // Calculate scores for each listing
  const matches: Match[] = [];

  for (const listing of listings) {
    const { scores, breakdown } = await calculateMatchScore(
      seekerProfile as SeekerProfile,
      listing as ListingWithPhotos
    );

    if (scores.total >= (options?.minScore || 30)) {
      matches.push({
        id: `${seekerId}-${listing.id}`,
        listing: listing as ListingWithPhotos,
        scores,
        breakdown,
        created_at: new Date().toISOString(),
      });
    }
  }

  // Sort by total score
  matches.sort((a, b) => b.scores.total - a.scores.total);

  return matches.slice(0, options?.limit || 20);
}
