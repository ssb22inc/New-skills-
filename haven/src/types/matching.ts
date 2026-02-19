import { ListingWithPhotos } from './listing';
import { SeekerProfile } from './user';

export interface MatchScore {
  total: number;
  lifestyle: number;
  personality: number;
  location: number;
  budget: number;
  amenity: number;
  trust: number;
}

export interface MatchBreakdown {
  lifestyle: {
    score: number;
    factors: {
      name: string;
      score: number;
      explanation: string;
    }[];
  };
  personality: {
    score: number;
    compatibility_type: string;
    explanation: string;
  };
  location: {
    score: number;
    distance_miles?: number;
    commute_mins?: number;
    in_preferred_area: boolean;
  };
  budget: {
    score: number;
    monthly_cost: number;
    percent_of_max_budget: number;
    includes_utilities: boolean;
  };
  amenity: {
    score: number;
    matched_must_haves: string[];
    missing_must_haves: string[];
    matched_nice_to_haves: string[];
    dealbreaker_conflicts: string[];
  };
  trust: {
    score: number;
    landlord_verified: boolean;
    landlord_rating?: number;
    response_rate?: number;
  };
}

export interface Match {
  id: string;
  listing: ListingWithPhotos;
  scores: MatchScore;
  breakdown: MatchBreakdown;
  seeker_action?: 'liked' | 'skipped' | 'saved' | 'messaged';
  landlord_action?: 'accepted' | 'rejected' | 'messaged';
  created_at: string;
}

export interface MatchingPreferences {
  weights?: {
    lifestyle?: number;
    personality?: number;
    location?: number;
    budget?: number;
    amenity?: number;
    trust?: number;
  };
  strict_dealbreakers?: boolean;
  minimum_score?: number;
}
