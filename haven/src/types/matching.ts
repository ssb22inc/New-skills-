import type { Database } from './database'
import type { ListingWithPhotos } from './listing'
import type { SeekerProfile } from './user'

export type Match = Database['public']['Tables']['matches']['Row']

export interface MatchWithDetails extends Match {
  listing: ListingWithPhotos
  seeker: SeekerProfile
}

export interface CompatibilityBreakdown {
  total: number
  lifestyle: {
    score: number
    details: string[]
  }
  personality: {
    score: number
    details: string[]
  }
  location: {
    score: number
    details: string[]
  }
  budget: {
    score: number
    details: string[]
  }
  amenities: {
    score: number
    matched: string[]
    missing: string[]
  }
  trust: {
    score: number
    details: string[]
  }
  summary: string
  highlights: string[]
  concerns: string[]
}

export interface MatchScore {
  total_score: number
  lifestyle_score: number
  personality_score: number
  location_score: number
  budget_score: number
  amenity_score: number
  trust_score: number
  breakdown: CompatibilityBreakdown
}

export type SeekerAction = 'liked' | 'skipped' | 'saved' | 'messaged'
export type LandlordAction = 'accepted' | 'rejected' | 'messaged'
