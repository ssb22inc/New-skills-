import type { SeekerProfile } from '@/types/user'
import type { Listing } from '@/types/listing'
import type { LifestyleProfile, LocationPreference } from '@/types/user'

export function scoreLifestyle(
  seeker: SeekerProfile,
  listing: Listing
): { score: number; details: string[] } {
  const lifestyle = seeker.lifestyle as Partial<LifestyleProfile>
  const details: string[] = []
  let score = 70 // base score

  if (!lifestyle) return { score, details }

  // Noise tolerance vs listing type
  if (listing.property_type === 'room' && (lifestyle.noise_tolerance ?? 5) < 4) {
    score -= 15
    details.push('Shared living may be noisy for your preference')
  }

  // Work from home check
  if (lifestyle.work_from_home) {
    const hasWorkspace = listing.amenities?.includes('workspace')
    if (hasWorkspace) {
      score += 10
      details.push('Has dedicated workspace for remote work')
    } else {
      score -= 5
      details.push('No dedicated workspace listed')
    }
  }

  // Cleanliness
  if ((lifestyle.cleanliness ?? 5) >= 8) {
    details.push('High cleanliness standards align with furnished unit')
  }

  // Pet policy
  const hasPets = (seeker.must_haves ?? []).includes('pets_allowed')
  if (hasPets) {
    if (listing.pet_policy === 'no_pets') {
      score -= 30
      details.push('Pet policy: no pets allowed')
    } else if (listing.pet_policy === 'all_pets') {
      score += 15
      details.push('Pet-friendly property')
    }
  }

  return { score: Math.min(100, Math.max(0, score)), details }
}

export function scoreLocation(
  seeker: SeekerProfile,
  listing: Listing
): { score: number; details: string[] } {
  const preferences = seeker.location_preferences as unknown as LocationPreference[]
  const details: string[] = []

  if (!preferences || preferences.length === 0) {
    return { score: 70, details: ['No location preference specified'] }
  }

  let bestScore = 0

  for (const pref of preferences) {
    let score = 0

    if (pref.city.toLowerCase() === listing.city.toLowerCase()) {
      score += 60
      details.push(`Located in preferred city: ${listing.city}`)

      if (pref.neighborhoods && listing.neighborhood) {
        const neighborhoodMatch = pref.neighborhoods.some(
          (n) => n.toLowerCase() === listing.neighborhood?.toLowerCase()
        )
        if (neighborhoodMatch) {
          score += 30
          details.push(`In preferred neighborhood: ${listing.neighborhood}`)
        }
      }
    }

    bestScore = Math.max(bestScore, score)
  }

  return { score: Math.min(100, bestScore), details }
}
