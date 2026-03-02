import type { Database, UserType, WorkSchedule } from './database'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type SeekerProfile = Database['public']['Tables']['seeker_profiles']['Row']
export type LandlordProfile = Database['public']['Tables']['landlord_profiles']['Row']

export interface ProfileWithDetails extends Profile {
  seeker_profile?: SeekerProfile
  landlord_profile?: LandlordProfile
}

export interface LifestyleProfile {
  sleep_schedule: 'early_bird' | 'night_owl' | 'flexible'
  noise_tolerance: number // 1-10
  cleanliness: number // 1-10
  guest_frequency: 'never' | 'rarely' | 'sometimes' | 'often'
  work_from_home: boolean
  cooking_frequency: 'never' | 'rarely' | 'sometimes' | 'daily'
  exercise_habits: string[]
  social_style: 'introverted' | 'ambivert' | 'extroverted'
}

export interface PersonalityProfile {
  openness: number // 0-100 OCEAN scores
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
  confidence: number // model confidence 0-1
}

export interface LocationPreference {
  city: string
  neighborhoods?: string[]
  max_commute_mins?: number
  commute_to?: string
  commute_mode?: 'car' | 'transit' | 'bike' | 'walk'
}

export interface SeekerOnboardingData {
  user_type: UserType
  profession?: string
  employer?: string
  work_schedule?: WorkSchedule
  budget_min: number
  budget_max: number
  move_in_date?: string
  lease_flexibility?: string
  location_preferences: LocationPreference[]
  must_haves: string[]
  nice_to_haves: string[]
  dealbreakers: string[]
  lifestyle: Partial<LifestyleProfile>
  personality?: Partial<PersonalityProfile>
}
