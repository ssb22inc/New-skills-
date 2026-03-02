import { Database, UserType, WorkSchedule } from './database';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type SeekerProfile = Database['public']['Tables']['seeker_profiles']['Row'];

export interface LocationPreference {
  city: string;
  state?: string;
  neighborhoods?: string[];
  max_commute_mins?: number;
  commute_to?: string;
  commute_method?: 'driving' | 'transit' | 'walking' | 'cycling';
}

export interface LifestyleProfile {
  sleep_schedule: 'early_bird' | 'night_owl' | 'flexible';
  noise_tolerance: number; // 1-10
  cleanliness: number; // 1-10
  guest_frequency: 'never' | 'rarely' | 'sometimes' | 'often';
  work_from_home: boolean;
  social_level: number; // 1-10
  cooking_frequency: 'never' | 'sometimes' | 'daily';
  pet_owner: boolean;
  pet_types?: string[];
  smoker: boolean;
  exercise_frequency: 'never' | 'sometimes' | 'daily';
}

export interface PersonalityProfile {
  openness: number; // 0-100
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  confidence: number; // 0-1, how confident the assessment is
}

export interface UserWithProfiles extends Profile {
  seeker_profile?: SeekerProfile | null;
  landlord_profile?: {
    id: string;
    company_name: string | null;
    is_professional: boolean;
    properties_count: number;
    average_rating: number | null;
    response_rate: number | null;
    response_time_hours: number | null;
  } | null;
}

export interface OnboardingState {
  step: number;
  userType: UserType | null;
  basicInfo: {
    full_name?: string;
    phone?: string;
    profession?: string;
    employer?: string;
    work_schedule?: WorkSchedule;
  };
  housingPreferences: {
    budget_min?: number;
    budget_max?: number;
    move_in_date?: string;
    move_out_date?: string;
    lease_flexibility?: string;
    location_preferences?: LocationPreference[];
    must_haves?: string[];
    nice_to_haves?: string[];
    dealbreakers?: string[];
  };
  lifestyle: Partial<LifestyleProfile>;
  personality: Partial<PersonalityProfile>;
  verification: {
    identity_started?: boolean;
    income_started?: boolean;
  };
}

// Legacy aliases kept for backward compatibility
export type SeekerOnboardingData = OnboardingState['housingPreferences'] & {
  user_type?: UserType;
  profession?: string;
  location_preferences: LocationPreference[];
  must_haves: string[];
  nice_to_haves: string[];
  dealbreakers: string[];
  lifestyle: Partial<LifestyleProfile>;
  personality?: Partial<PersonalityProfile>;
};
