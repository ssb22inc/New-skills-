-- Haven Database Schema
-- Run this in Supabase SQL Editor or via migration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_type AS ENUM ('seeker', 'landlord', 'both');
CREATE TYPE property_type AS ENUM ('apartment', 'house', 'condo', 'room', 'townhouse', 'studio');
CREATE TYPE furniture_status AS ENUM ('furnished', 'partially_furnished', 'unfurnished');
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'rented', 'archived');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected', 'expired');
CREATE TYPE booking_status AS ENUM ('inquiry', 'pending', 'confirmed', 'active', 'completed', 'cancelled');
CREATE TYPE work_schedule AS ENUM ('day', 'night', 'rotating', 'flexible', 'remote');

-- ============================================================================
-- USERS & PROFILES
-- ============================================================================

-- Extends Supabase auth.users
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Basic info
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    user_type user_type DEFAULT 'seeker',

    -- Onboarding status
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 0,

    -- Verification
    identity_verified BOOLEAN DEFAULT FALSE,
    income_verified BOOLEAN DEFAULT FALSE,
    background_check_completed BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMPTZ,

    -- Settings
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Seeker-specific profile data
CREATE TABLE public.seeker_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Professional info
    profession TEXT,
    employer TEXT,
    work_schedule work_schedule,

    -- Housing preferences
    budget_min INTEGER,
    budget_max INTEGER,
    move_in_date DATE,
    move_out_date DATE,
    lease_flexibility TEXT, -- 'exact', 'flexible_start', 'flexible_end', 'very_flexible'

    -- Location preferences (stored as array of location objects)
    location_preferences JSONB DEFAULT '[]'::jsonb,
    -- Example: [{"city": "Houston", "neighborhoods": ["Midtown", "Montrose"], "max_commute_mins": 20, "commute_to": "Texas Medical Center"}]

    -- Requirements
    must_haves TEXT[] DEFAULT '{}',
    nice_to_haves TEXT[] DEFAULT '{}',
    dealbreakers TEXT[] DEFAULT '{}',

    -- Lifestyle profile
    lifestyle JSONB DEFAULT '{}'::jsonb,
    -- Example: {"sleep_schedule": "night_owl", "noise_tolerance": 3, "cleanliness": 8, "guest_frequency": "rarely", "work_from_home": true}

    -- Personality profile (OCEAN scores 0-100)
    personality JSONB DEFAULT '{}'::jsonb,
    -- Example: {"openness": 65, "conscientiousness": 80, "extraversion": 35, "agreeableness": 70, "neuroticism": 45, "confidence": 0.75}

    -- Income verification
    verified_monthly_income INTEGER,
    income_verification_date TIMESTAMPTZ,
    income_document_type TEXT,

    -- Profile embedding for matching (vector)
    profile_embedding vector(1536),

    UNIQUE(user_id)
);

-- Landlord-specific profile data
CREATE TABLE public.landlord_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Business info
    company_name TEXT,
    is_professional BOOLEAN DEFAULT FALSE, -- property manager vs individual
    properties_count INTEGER DEFAULT 0,

    -- Preferences
    preferred_tenant_types TEXT[] DEFAULT '{}', -- 'travel_nurse', 'corporate', 'student', etc.
    auto_reply_enabled BOOLEAN DEFAULT TRUE,
    instant_booking_enabled BOOLEAN DEFAULT FALSE,

    -- Stripe Connect
    stripe_account_id TEXT,
    stripe_onboarding_complete BOOLEAN DEFAULT FALSE,

    -- Stats
    total_bookings INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    response_rate DECIMAL(5,2),
    response_time_hours DECIMAL(5,2),

    UNIQUE(user_id)
);

-- ============================================================================
-- LISTINGS
-- ============================================================================

CREATE TABLE public.listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Status
    status listing_status DEFAULT 'draft',
    published_at TIMESTAMPTZ,

    -- Basic info
    title TEXT NOT NULL,
    headline TEXT,
    description TEXT,

    -- Property details
    property_type property_type NOT NULL,
    bedrooms INTEGER,
    bathrooms DECIMAL(3,1),
    sqft INTEGER,
    floor_level INTEGER,
    year_built INTEGER,

    -- Location
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    neighborhood TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Pricing
    price_monthly INTEGER NOT NULL,
    price_weekly INTEGER,
    security_deposit INTEGER,
    cleaning_fee INTEGER,
    utilities_included BOOLEAN DEFAULT FALSE,
    utilities_estimate INTEGER,

    -- Availability
    available_date DATE,
    minimum_stay_days INTEGER DEFAULT 30,
    maximum_stay_days INTEGER,
    instant_booking BOOLEAN DEFAULT FALSE,

    -- Features
    furniture_status furniture_status DEFAULT 'furnished',
    amenities TEXT[] DEFAULT '{}',
    house_rules TEXT[] DEFAULT '{}',

    -- Policies
    pet_policy TEXT, -- 'no_pets', 'cats_ok', 'dogs_ok', 'all_pets', 'negotiable'
    smoking_policy TEXT, -- 'no_smoking', 'outside_only', 'allowed'
    guest_policy TEXT,

    -- AI-generated data
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    -- Stores: condition_score, style, highlights, target_demographics, seo_keywords

    -- SEO
    slug TEXT UNIQUE,
    seo_title TEXT,
    seo_description TEXT,

    -- Stats
    views_count INTEGER DEFAULT 0,
    inquiries_count INTEGER DEFAULT 0,
    favorites_count INTEGER DEFAULT 0,

    -- Embedding for search/matching
    listing_embedding vector(1536)
);

-- Listing photos
CREATE TABLE public.listing_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Storage
    storage_path TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,

    -- Metadata
    position INTEGER DEFAULT 0,
    room_type TEXT,
    caption TEXT,
    is_primary BOOLEAN DEFAULT FALSE,

    -- AI analysis
    ai_analysis JSONB DEFAULT '{}'::jsonb
    -- Stores: detected_room, features, condition_score, quality_issues
);

-- ============================================================================
-- MATCHING & BOOKINGS
-- ============================================================================

-- Match scores between seekers and listings
CREATE TABLE public.matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    seeker_id UUID NOT NULL REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,

    -- Scores (0-100)
    total_score INTEGER NOT NULL,
    lifestyle_score INTEGER,
    personality_score INTEGER,
    location_score INTEGER,
    budget_score INTEGER,
    amenity_score INTEGER,
    trust_score INTEGER,

    -- Score breakdown for explainability
    score_breakdown JSONB DEFAULT '{}'::jsonb,

    -- ML model adjustments
    ml_adjustment INTEGER DEFAULT 0,
    ml_confidence DECIMAL(3,2),

    -- User actions
    seeker_action TEXT, -- 'liked', 'skipped', 'saved', 'messaged'
    seeker_action_at TIMESTAMPTZ,
    landlord_action TEXT, -- 'accepted', 'rejected', 'messaged'
    landlord_action_at TIMESTAMPTZ,

    -- Outcome tracking (for ML training)
    outcome TEXT, -- 'booked', 'not_booked', 'cancelled'
    outcome_at TIMESTAMPTZ,

    UNIQUE(seeker_id, listing_id)
);

-- Bookings/Reservations
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    listing_id UUID NOT NULL REFERENCES public.listings(id),
    seeker_id UUID NOT NULL REFERENCES public.profiles(id),
    landlord_id UUID NOT NULL REFERENCES public.profiles(id),

    -- Status
    status booking_status DEFAULT 'inquiry',

    -- Dates
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,

    -- Pricing
    monthly_rate INTEGER NOT NULL,
    total_rent INTEGER NOT NULL,
    security_deposit INTEGER,
    cleaning_fee INTEGER,
    service_fee INTEGER,
    total_amount INTEGER NOT NULL,

    -- Payment
    stripe_payment_intent_id TEXT,
    payment_status TEXT,
    paid_at TIMESTAMPTZ,

    -- Communication
    initial_message TEXT,

    -- Cancellation
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id),
    cancellation_reason TEXT,

    -- Reviews
    seeker_review_id UUID,
    landlord_review_id UUID
);

-- ============================================================================
-- MESSAGING
-- ============================================================================

CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    listing_id UUID REFERENCES public.listings(id),
    booking_id UUID REFERENCES public.bookings(id),

    -- Participants
    participant_ids UUID[] NOT NULL,

    -- Last message preview
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,

    -- Read status per participant
    read_status JSONB DEFAULT '{}'::jsonb
    -- Example: {"user_id_1": "2024-01-01T00:00:00Z", "user_id_2": null}
);

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id),

    -- Content
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text', -- 'text', 'image', 'system', 'booking_request'

    -- Attachments
    attachments JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Read tracking
    read_at TIMESTAMPTZ
);

-- ============================================================================
-- REVIEWS
-- ============================================================================

CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    booking_id UUID NOT NULL REFERENCES public.bookings(id),
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
    reviewee_id UUID NOT NULL REFERENCES public.profiles(id),
    listing_id UUID REFERENCES public.listings(id),

    -- Review type
    review_type TEXT NOT NULL, -- 'seeker_to_landlord', 'landlord_to_seeker', 'seeker_to_listing'

    -- Ratings (1-5)
    overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    accuracy_rating INTEGER CHECK (accuracy_rating >= 1 AND accuracy_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    cleanliness_rating INTEGER CHECK (cleanliness_rating >= 1 AND cleanliness_rating <= 5),
    location_rating INTEGER CHECK (location_rating >= 1 AND location_rating <= 5),
    value_rating INTEGER CHECK (value_rating >= 1 AND value_rating <= 5),

    -- Content
    title TEXT,
    content TEXT,

    -- Response
    response TEXT,
    response_at TIMESTAMPTZ,

    -- Visibility
    is_public BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- VERIFICATIONS & DOCUMENTS
-- ============================================================================

CREATE TABLE public.verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Type
    verification_type TEXT NOT NULL, -- 'identity', 'income', 'employment', 'background'

    -- Status
    status verification_status DEFAULT 'pending',

    -- Document info
    document_type TEXT,
    document_storage_path TEXT,

    -- Extracted data (encrypted or hashed sensitive data)
    extracted_data JSONB DEFAULT '{}'::jsonb,

    -- AI analysis
    ai_confidence DECIMAL(3,2),
    ai_analysis JSONB DEFAULT '{}'::jsonb,

    -- Manual review
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    -- Expiry
    expires_at TIMESTAMPTZ,

    -- Third-party verification IDs
    external_verification_id TEXT,
    external_provider TEXT -- 'persona', 'plaid', 'checkr'
);

-- ============================================================================
-- MARKET DATA & PRICING
-- ============================================================================

CREATE TABLE public.market_comparables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Location
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT,
    neighborhood TEXT,

    -- Property characteristics
    property_type property_type,
    bedrooms INTEGER,
    bathrooms DECIMAL(3,1),
    sqft_min INTEGER,
    sqft_max INTEGER,

    -- Pricing data
    price_median INTEGER,
    price_25th INTEGER,
    price_75th INTEGER,
    price_min INTEGER,
    price_max INTEGER,

    -- Sample size
    sample_count INTEGER,

    -- Time period
    data_month DATE,

    -- Source
    data_source TEXT -- 'internal', 'zillow', 'rentometer', etc.
);

-- ============================================================================
-- ANALYTICS & EVENTS
-- ============================================================================

CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Actor
    user_id UUID REFERENCES public.profiles(id),
    session_id TEXT,

    -- Event
    event_type TEXT NOT NULL,
    event_category TEXT,

    -- Target
    listing_id UUID REFERENCES public.listings(id),
    target_user_id UUID REFERENCES public.profiles(id),

    -- Data
    properties JSONB DEFAULT '{}'::jsonb,

    -- Context
    page_url TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_address INET
);

-- ============================================================================
-- SUBSCRIPTIONS & BILLING
-- ============================================================================

CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Stripe
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,

    -- Plan
    plan_id TEXT NOT NULL,
    plan_name TEXT,

    -- Status
    status TEXT NOT NULL, -- 'active', 'past_due', 'cancelled', 'trialing'

    -- Dates
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Usage (for landlords)
    listings_limit INTEGER,
    listings_used INTEGER DEFAULT 0,

    UNIQUE(user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Profiles
CREATE INDEX idx_profiles_user_type ON public.profiles(user_type);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- Seeker profiles
CREATE INDEX idx_seeker_profiles_user_id ON public.seeker_profiles(user_id);
CREATE INDEX idx_seeker_profiles_budget ON public.seeker_profiles(budget_min, budget_max);

-- Landlord profiles
CREATE INDEX idx_landlord_profiles_user_id ON public.landlord_profiles(user_id);

-- Listings
CREATE INDEX idx_listings_user_id ON public.listings(user_id);
CREATE INDEX idx_listings_status ON public.listings(status);
CREATE INDEX idx_listings_city_state ON public.listings(city, state);
CREATE INDEX idx_listings_price ON public.listings(price_monthly);
CREATE INDEX idx_listings_bedrooms ON public.listings(bedrooms);
CREATE INDEX idx_listings_available_date ON public.listings(available_date);
CREATE INDEX idx_listings_location ON public.listings USING GIST (
    ll_to_earth(latitude, longitude)
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Matches
CREATE INDEX idx_matches_seeker_id ON public.matches(seeker_id);
CREATE INDEX idx_matches_listing_id ON public.matches(listing_id);
CREATE INDEX idx_matches_total_score ON public.matches(total_score DESC);

-- Bookings
CREATE INDEX idx_bookings_listing_id ON public.bookings(listing_id);
CREATE INDEX idx_bookings_seeker_id ON public.bookings(seeker_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);

-- Messages
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Events
CREATE INDEX idx_events_user_id ON public.events(user_id);
CREATE INDEX idx_events_type ON public.events(event_type);
CREATE INDEX idx_events_listing_id ON public.events(listing_id);
CREATE INDEX idx_events_created_at ON public.events(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landlord_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles, update only their own
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Listings: Active listings are public, users can manage their own
CREATE POLICY "Active listings are viewable by everyone" ON public.listings
    FOR SELECT USING (status = 'active' OR user_id = auth.uid());

CREATE POLICY "Users can insert own listings" ON public.listings
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own listings" ON public.listings
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own listings" ON public.listings
    FOR DELETE USING (user_id = auth.uid());

-- Matches: Users can see their own matches
CREATE POLICY "Users can view own matches" ON public.matches
    FOR SELECT USING (
        seeker_id IN (SELECT id FROM public.seeker_profiles WHERE user_id = auth.uid())
        OR listing_id IN (SELECT id FROM public.listings WHERE user_id = auth.uid())
    );

-- Bookings: Participants can see their bookings
CREATE POLICY "Booking participants can view" ON public.bookings
    FOR SELECT USING (seeker_id = auth.uid() OR landlord_id = auth.uid());

-- Messages: Conversation participants only
CREATE POLICY "Conversation participants can view messages" ON public.messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE auth.uid() = ANY(participant_ids)
        )
    );

CREATE POLICY "Conversation participants can send messages" ON public.messages
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE auth.uid() = ANY(participant_ids)
        )
        AND sender_id = auth.uid()
    );

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update listing stats
CREATE OR REPLACE FUNCTION increment_listing_views(listing_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.listings
    SET views_count = views_count + 1
    WHERE id = listing_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate listing slug
CREATE OR REPLACE FUNCTION generate_listing_slug()
RETURNS TRIGGER AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base slug from title and city
    base_slug := lower(regexp_replace(
        NEW.title || '-' || NEW.city,
        '[^a-zA-Z0-9]+', '-', 'g'
    ));
    base_slug := trim(both '-' from base_slug);

    final_slug := base_slug;

    -- Check for uniqueness and append number if needed
    WHILE EXISTS (SELECT 1 FROM public.listings WHERE slug = final_slug AND id != NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    NEW.slug := final_slug;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_listing_slug_trigger
    BEFORE INSERT OR UPDATE OF title, city ON public.listings
    FOR EACH ROW EXECUTE FUNCTION generate_listing_slug();
