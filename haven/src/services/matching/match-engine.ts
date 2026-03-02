import type { SeekerProfile } from '@/types/user'
import type { Listing } from '@/types/listing'
import type { MatchScore } from '@/types/matching'
import { scoreLifestyle } from './lifestyle-scorer'
import { scoreLocation } from './lifestyle-scorer'
import { scorePersonality } from './personality-scorer'
import { scoreTrust } from './trust-scorer'

const WEIGHTS = {
  lifestyle: 0.30,
  personality: 0.20,
  location: 0.25,
  budget: 0.15,
  amenities: 0.05,
  trust: 0.05,
}

export async function calculateMatchScore(
  seeker: SeekerProfile,
  listing: Listing
): Promise<MatchScore> {
  const lifestyle = scoreLifestyle(seeker, listing)
  const personality = scorePersonality(seeker)
  const location = scoreLocation(seeker, listing)
  const budget = scoreBudget(seeker, listing)
  const amenities = scoreAmenities(seeker, listing)
  const trust = scoreTrust(seeker)

  const total = Math.round(
    lifestyle.score * WEIGHTS.lifestyle +
    personality.score * WEIGHTS.personality +
    location.score * WEIGHTS.location +
    budget.score * WEIGHTS.budget +
    amenities.score * WEIGHTS.amenities +
    trust.score * WEIGHTS.trust
  )

  return {
    total_score: total,
    lifestyle_score: lifestyle.score,
    personality_score: personality.score,
    location_score: location.score,
    budget_score: budget.score,
    amenity_score: amenities.score,
    trust_score: trust.score,
    breakdown: {
      total,
      lifestyle: { score: lifestyle.score, details: lifestyle.details },
      personality: { score: personality.score, details: personality.details },
      location: { score: location.score, details: location.details },
      budget: { score: budget.score, details: budget.details },
      amenities: {
        score: amenities.score,
        matched: amenities.matched,
        missing: amenities.missing,
      },
      trust: { score: trust.score, details: trust.details },
      summary: generateSummary(total),
      highlights: [...lifestyle.details.slice(0, 2), ...location.details.slice(0, 1)],
      concerns: budget.score < 60 ? ['Budget may be a stretch'] : [],
    },
  }
}

function scoreBudget(
  seeker: SeekerProfile,
  listing: Listing
): { score: number; details: string[] } {
  const { budget_min, budget_max } = seeker
  const price = listing.price_monthly

  if (!budget_max) return { score: 70, details: ['No budget specified'] }

  if (price <= (budget_max ?? Infinity)) {
    const comfort = budget_min ? (price - budget_min) / ((budget_max ?? price) - (budget_min ?? 0)) : 0.5
    const score = Math.round(100 - comfort * 30)
    return { score, details: [`$${price}/mo fits within budget`] }
  }

  const overage = ((price - (budget_max ?? price)) / (budget_max ?? price)) * 100
  const score = Math.max(0, 100 - overage * 2)
  return {
    score: Math.round(score),
    details: [`$${price}/mo is ${Math.round(overage)}% over budget max`],
  }
}

function scoreAmenities(
  seeker: SeekerProfile,
  listing: Listing
): { score: number; matched: string[]; missing: string[] } {
  const mustHaves = seeker.must_haves || []
  const listingAmenities = listing.amenities || []

  if (mustHaves.length === 0) return { score: 80, matched: [], missing: [] }

  const matched = mustHaves.filter((a) => listingAmenities.includes(a))
  const missing = mustHaves.filter((a) => !listingAmenities.includes(a))
  const score = Math.round((matched.length / mustHaves.length) * 100)

  return { score, matched, missing }
}

function generateSummary(score: number): string {
  if (score >= 90) return 'Exceptional match across all compatibility factors'
  if (score >= 80) return 'Strong match with great lifestyle and location alignment'
  if (score >= 70) return 'Good match with some minor trade-offs'
  if (score >= 60) return 'Decent match, consider the compatibility breakdown'
  return 'Some significant differences to consider'
}
