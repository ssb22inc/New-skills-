import { faker } from '@faker-js/faker';
import type { Listing } from '@/types/listing';
import type { Profile, SeekerProfile } from '@/types/user';
import type { Match } from '@/types/matching';

export function createMockProfile(overrides?: Partial<Profile>): Profile {
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

export function createMockListing(overrides?: Partial<Listing>): Listing {
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
    bathrooms: faker.number.float({ min: 1, max: 4, fractionDigits: 1 }),
    sqft: faker.number.int({ min: 400, max: 3000 }),
    address_line1: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip_code: faker.location.zipCode(),
    neighborhood: faker.location.county(),
    latitude: faker.location.latitude(),
    longitude: faker.location.longitude(),
    price_monthly: faker.number.int({ min: 1000, max: 5000 }),
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
  } as Listing;
}

export function createMockSeekerProfile(overrides?: Partial<SeekerProfile>): SeekerProfile {
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
  } as SeekerProfile;
}

export function createMockListings(count: number): Listing[] {
  return Array.from({ length: count }, () => createMockListing());
}

export function createMockMatches(count: number): Match[] {
  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    // Mock listings omit the photos relation; Match expects ListingWithPhotos.
    listing: { ...createMockListing(), listing_photos: [] } as unknown as Match['listing'],
    scores: {
      total: faker.number.int({ min: 40, max: 100 }),
      lifestyle: faker.number.int({ min: 40, max: 100 }),
      personality: faker.number.int({ min: 40, max: 100 }),
      location: faker.number.int({ min: 40, max: 100 }),
      budget: faker.number.int({ min: 40, max: 100 }),
      amenity: faker.number.int({ min: 40, max: 100 }),
      trust: faker.number.int({ min: 40, max: 100 }),
    },
    breakdown: {} as any,
    created_at: faker.date.recent().toISOString(),
  }));
}
