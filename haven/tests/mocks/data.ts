import { faker } from '@faker-js/faker';

export interface MockProfile {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  user_type: 'seeker' | 'landlord' | 'both';
  onboarding_completed: boolean;
  onboarding_step: number;
  identity_verified: boolean;
  income_verified: boolean;
  background_check_completed: boolean;
  verification_date?: string;
  email_notifications: boolean;
  sms_notifications: boolean;
  metadata: Record<string, any>;
}

export interface MockListing {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'active' | 'inactive' | 'rented';
  title: string;
  headline?: string;
  description: string;
  property_type: 'apartment' | 'house' | 'condo' | 'room' | 'studio';
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  address_line1: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
  price: number;
  utilities_included: boolean;
  available_date?: string;
  minimum_stay_days: number;
  instant_booking: boolean;
  furniture_status: 'furnished' | 'unfurnished' | 'partial';
  amenities: string[];
  house_rules: string[];
  views_count: number;
  inquiries_count: number;
  favorites_count: number;
}

export interface MockSeekerProfile {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  profession: string;
  employer: string;
  work_schedule: 'day' | 'night' | 'rotating';
  budget_min: number;
  budget_max: number;
  move_in_date: string;
  move_out_date?: string;
  lease_flexibility: 'strict' | 'flexible';
  location_preferences: Array<{
    city: string;
    state: string;
    neighborhoods?: string[];
  }>;
  must_haves: string[];
  nice_to_haves: string[];
  dealbreakers: string[];
  lifestyle: {
    sleep_schedule: 'early_bird' | 'night_owl' | 'flexible';
    noise_tolerance: number;
    cleanliness: number;
    guest_frequency: 'often' | 'sometimes' | 'rarely';
    work_from_home: boolean;
  };
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
    confidence: number;
  };
}

export function createMockProfile(overrides?: Partial<MockProfile>): MockProfile {
  return {
    id: faker.string.uuid(),
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    email: faker.internet.email(),
    full_name: faker.person.fullName(),
    phone: faker.phone.number(),
    avatar_url: faker.image.avatar(),
    user_type: faker.helpers.arrayElement(['seeker', 'landlord', 'both']),
    onboarding_completed: true,
    onboarding_step: 4,
    identity_verified: faker.datatype.boolean(),
    income_verified: faker.datatype.boolean(),
    background_check_completed: faker.datatype.boolean(),
    verification_date: faker.date.past().toISOString(),
    email_notifications: true,
    sms_notifications: false,
    metadata: {},
    ...overrides,
  };
}

export function createMockListing(overrides?: Partial<MockListing>): MockListing {
  return {
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    status: 'active',
    title: faker.lorem.sentence(6),
    headline: faker.lorem.sentence(10),
    description: faker.lorem.paragraphs(3),
    property_type: faker.helpers.arrayElement(['apartment', 'house', 'condo', 'room', 'studio']),
    bedrooms: faker.number.int({ min: 0, max: 5 }),
    bathrooms: faker.number.int({ min: 1, max: 4 }),
    sqft: faker.number.int({ min: 400, max: 3000 }),
    address_line1: faker.location.streetAddress(),
    address_city: faker.location.city(),
    address_state: faker.location.state({ abbreviated: true }),
    address_zip: faker.location.zipCode(),
    neighborhood: faker.location.county(),
    latitude: parseFloat(faker.location.latitude()),
    longitude: parseFloat(faker.location.longitude()),
    price: faker.number.int({ min: 1000, max: 5000 }),
    utilities_included: faker.datatype.boolean(),
    available_date: faker.date.future().toISOString().split('T')[0],
    minimum_stay_days: 30,
    instant_booking: faker.datatype.boolean(),
    furniture_status: 'furnished',
    amenities: faker.helpers.arrayElements(['wifi', 'parking', 'washer_dryer', 'gym', 'pool'], 3),
    house_rules: [],
    views_count: faker.number.int({ min: 0, max: 500 }),
    inquiries_count: faker.number.int({ min: 0, max: 50 }),
    favorites_count: faker.number.int({ min: 0, max: 100 }),
    ...overrides,
  };
}

export function createMockSeekerProfile(overrides?: Partial<MockSeekerProfile>): MockSeekerProfile {
  return {
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    profession: 'Registered Nurse',
    employer: faker.company.name() + ' Hospital',
    work_schedule: faker.helpers.arrayElement(['day', 'night', 'rotating']),
    budget_min: 1500,
    budget_max: 2500,
    move_in_date: faker.date.future().toISOString().split('T')[0],
    move_out_date: faker.date.future({ years: 1 }).toISOString().split('T')[0],
    lease_flexibility: 'flexible',
    location_preferences: [{ city: 'Houston', state: 'TX', neighborhoods: ['Midtown'] }],
    must_haves: ['wifi', 'parking'],
    nice_to_haves: ['gym', 'pool'],
    dealbreakers: ['no_pets'],
    lifestyle: {
      sleep_schedule: 'night_owl',
      noise_tolerance: 5,
      cleanliness: 8,
      guest_frequency: 'rarely',
      work_from_home: false,
    },
    personality: {
      openness: 70,
      conscientiousness: 80,
      extraversion: 40,
      agreeableness: 75,
      neuroticism: 35,
      confidence: 0.8,
    },
    ...overrides,
  };
}

export function createMockListings(count: number): MockListing[] {
  return Array.from({ length: count }, () => createMockListing());
}

export function createMockMatches(count: number): any[] {
  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    listing: createMockListing(),
    match_score: faker.number.int({ min: 40, max: 100 }),
    match_breakdown: {
      lifestyle_score: faker.number.int({ min: 40, max: 100 }),
      personality_score: faker.number.int({ min: 40, max: 100 }),
      location_score: faker.number.int({ min: 40, max: 100 }),
      budget_score: faker.number.int({ min: 40, max: 100 }),
      amenity_score: faker.number.int({ min: 40, max: 100 }),
      trust_score: faker.number.int({ min: 40, max: 100 }),
    },
    created_at: faker.date.recent().toISOString(),
  }));
}
