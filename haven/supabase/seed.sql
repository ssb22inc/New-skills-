-- Haven Development Seed Data
-- Run via: ./scripts/seed.sh  OR  supabase db seed
-- DO NOT run this against production!
-- ============================================================

-- ============================================================
-- Test Users (Supabase auth.users)
-- ============================================================
-- Note: In real Supabase, use supabase.auth.admin.createUser() via
-- the seed script. These INSERTs require the service role.

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'landlord@example.com', NOW(), NOW(), NOW(), '{"full_name": "Alice Landlord"}'),
  ('00000000-0000-0000-0000-000000000002', 'seeker@example.com',   NOW(), NOW(), NOW(), '{"full_name": "Bob Seeker"}'),
  ('00000000-0000-0000-0000-000000000003', 'seeker2@example.com',  NOW(), NOW(), NOW(), '{"full_name": "Carol Seeker"}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Profiles (auto-created by trigger, but we upsert to set type)
-- ============================================================

UPDATE public.profiles SET
  user_type = 'landlord',
  onboarding_completed = TRUE,
  identity_verified = TRUE,
  full_name = 'Alice Landlord'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.profiles SET
  user_type = 'seeker',
  onboarding_completed = TRUE,
  full_name = 'Bob Seeker'
WHERE id = '00000000-0000-0000-0000-000000000002';

UPDATE public.profiles SET
  user_type = 'seeker',
  onboarding_completed = TRUE,
  full_name = 'Carol Seeker'
WHERE id = '00000000-0000-0000-0000-000000000003';

-- ============================================================
-- Landlord Profile
-- ============================================================

INSERT INTO public.landlord_profiles (user_id, company_name, is_professional, properties_count, response_rate, average_rating)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alice Properties LLC', TRUE, 3, 98.5, 4.8)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- Seeker Profiles
-- ============================================================

INSERT INTO public.seeker_profiles (
  user_id, profession, budget_min, budget_max, move_in_date,
  location_preferences, must_haves, lifestyle, personality
)
VALUES
  (
    '00000000-0000-0000-0000-000000000002',
    'Software Engineer', 2000, 3500,
    (NOW() + INTERVAL '30 days')::DATE,
    '[{"city": "San Francisco", "state": "CA"}]',
    ARRAY['wifi', 'parking', 'laundry'],
    '{"sleep_schedule": "early_bird", "noise_level": "quiet", "pets": false, "smoking": false}',
    '{"openness": 80, "conscientiousness": 75, "extraversion": 40}'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Designer', 1800, 3000,
    (NOW() + INTERVAL '14 days')::DATE,
    '[{"city": "San Francisco", "state": "CA"}, {"city": "Oakland", "state": "CA"}]',
    ARRAY['natural_light', 'kitchen', 'gym'],
    '{"sleep_schedule": "night_owl", "noise_level": "moderate", "pets": true, "smoking": false}',
    '{"openness": 90, "conscientiousness": 60, "extraversion": 70}'
  )
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- Listings
-- ============================================================

INSERT INTO public.listings (
  id, user_id, status, title, headline, description,
  property_type, bedrooms, bathrooms, sqft,
  address_line1, city, state, zip_code, neighborhood,
  latitude, longitude,
  price_monthly, security_deposit, utilities_included,
  available_date, minimum_stay_days, furniture_status,
  amenities, house_rules, published_at
)
VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'active',
    'Modern 1BR in Hayes Valley',
    'Bright, furnished studio steps from the best cafes in SF',
    'A beautifully renovated one-bedroom apartment in the heart of Hayes Valley. Floor-to-ceiling windows, in-unit laundry, high-speed WiFi included. Ideal for working professionals.',
    'apartment', 1, 1.0, 650,
    '123 Ivy St', 'San Francisco', 'CA', '94102', 'Hayes Valley',
    37.7757, -122.4242,
    2800, 2800, TRUE,
    (NOW() + INTERVAL '15 days')::DATE, 30, 'furnished',
    ARRAY['wifi', 'laundry', 'dishwasher', 'air_conditioning', 'hardwood_floors'],
    ARRAY['no_smoking', 'no_parties'],
    NOW()
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'active',
    'Spacious 2BR in Mission District',
    'Charming two-bedroom with Victorian details and a shared garden',
    'A gorgeous two-bedroom apartment in the vibrant Mission District. Original Victorian details, updated kitchen, shared garden patio. Walking distance to BART.',
    'apartment', 2, 1.0, 950,
    '456 Valencia St', 'San Francisco', 'CA', '94110', 'Mission District',
    37.7590, -122.4213,
    3400, 3400, FALSE,
    (NOW() + INTERVAL '7 days')::DATE, 30, 'partially_furnished',
    ARRAY['wifi', 'parking', 'patio', 'dishwasher', 'pets_allowed'],
    ARRAY['no_smoking'],
    NOW()
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'active',
    'Cozy Studio in SOMA',
    'Modern micro-studio in tech hub, all utilities included',
    'Efficient and well-designed studio in SOMA, steps from Caltrain and tech offices. Smart home controls, standing desk included, all utilities covered.',
    'studio', 0, 1.0, 420,
    '789 Brannan St', 'San Francisco', 'CA', '94103', 'SOMA',
    37.7749, -122.4009,
    2200, 2200, TRUE,
    NOW()::DATE, 30, 'furnished',
    ARRAY['wifi', 'gym', 'concierge', 'air_conditioning', 'smart_home'],
    ARRAY['no_smoking', 'no_pets', 'quiet_hours_10pm'],
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Market Comparables (for AI pricing suggestions)
-- ============================================================

INSERT INTO public.market_comparables (
  city, state, zip_code, neighborhood, property_type, bedrooms, bathrooms,
  sqft_min, sqft_max, price_median, price_25th, price_75th, price_min, price_max,
  sample_count, data_month, data_source
)
VALUES
  ('San Francisco', 'CA', '94102', 'Hayes Valley',  'apartment', 1, 1, 500,  800,  2750, 2500, 3000, 2200, 3500, 142, '2024-01-01', 'internal'),
  ('San Francisco', 'CA', '94110', 'Mission District','apartment',2, 1, 800,  1200, 3200, 2900, 3600, 2600, 4200, 98,  '2024-01-01', 'internal'),
  ('San Francisco', 'CA', '94103', 'SOMA',           'studio',   0, 1, 350,  550,  2100, 1900, 2400, 1600, 2900, 203, '2024-01-01', 'internal'),
  ('Oakland',       'CA', '94612', 'Uptown',         'apartment', 1, 1, 550,  850,  1900, 1700, 2200, 1400, 2800, 87,  '2024-01-01', 'internal')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Matches (pre-computed for dev testing)
-- ============================================================

INSERT INTO public.matches (
  seeker_id, listing_id, total_score,
  lifestyle_score, personality_score, location_score,
  budget_score, amenity_score, trust_score
)
SELECT
  sp.id,
  'aaaaaaaa-0000-0000-0000-000000000001',
  82, 85, 78, 90, 80, 75, 85
FROM public.seeker_profiles sp
WHERE sp.user_id = '00000000-0000-0000-0000-000000000002'
ON CONFLICT (seeker_id, listing_id) DO NOTHING;

INSERT INTO public.matches (
  seeker_id, listing_id, total_score,
  lifestyle_score, personality_score, location_score,
  budget_score, amenity_score, trust_score
)
SELECT
  sp.id,
  'aaaaaaaa-0000-0000-0000-000000000002',
  74, 70, 72, 85, 65, 80, 75
FROM public.seeker_profiles sp
WHERE sp.user_id = '00000000-0000-0000-0000-000000000002'
ON CONFLICT (seeker_id, listing_id) DO NOTHING;
