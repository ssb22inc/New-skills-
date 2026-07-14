import { http, HttpResponse } from 'msw';
import type { Match } from '@/types/matching';

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  full_name: 'Test User',
  user_type: 'seeker',
  onboarding_completed: true,
};

export const mockListing = {
  id: 'listing-123',
  user_id: 'landlord-456',
  title: 'Cozy 2BR near Hospital',
  description: 'Beautiful furnished apartment...',
  property_type: 'apartment',
  bedrooms: 2,
  bathrooms: 1,
  sqft: 950,
  address_line1: '123 Main St',
  city: 'Houston',
  state: 'TX',
  zip_code: '77001',
  price_monthly: 2000,
  status: 'active',
  amenities: ['wifi', 'washer_dryer', 'parking'],
  photos: [
    { id: 'photo-1', url: 'https://test.com/photo1.jpg', is_primary: true },
    { id: 'photo-2', url: 'https://test.com/photo2.jpg', is_primary: false },
  ],
};

export const mockMatch = {
  id: 'match-123',
  created_at: '2024-01-01T00:00:00.000Z',
  listing: mockListing,
  scores: {
    total: 85,
    lifestyle: 80,
    personality: 75,
    location: 90,
    budget: 85,
    amenity: 88,
    trust: 82,
  },
  breakdown: {
    lifestyle: { score: 80, factors: [] },
    personality: { score: 75, compatibility_type: 'good', explanation: 'Compatible' },
    location: { score: 90, in_preferred_area: true },
    budget: { score: 85, monthly_cost: 2000, percent_of_max_budget: 80, includes_utilities: false },
    amenity: { score: 88, matched_must_haves: ['wifi'], missing_must_haves: [], matched_nice_to_haves: ['parking'], dealbreaker_conflicts: [] },
    trust: { score: 82, landlord_verified: true },
  },
  // The hand-rolled mock listing is intentionally a subset of the full Row.
} as unknown as Match;

export const handlers = [
  // Auth endpoints
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as any;
    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({ user: mockUser });
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }),

  // Listings endpoints
  http.get('/api/listings', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const city = url.searchParams.get('city');

    let listings = [mockListing];
    if (city) {
      listings = listings.filter((l) =>
        l.city.toLowerCase().includes(city.toLowerCase())
      );
    }

    return HttpResponse.json({
      listings,
      pagination: { page, limit, total: listings.length },
    });
  }),

  http.get('/api/listings/:id', ({ params }) => {
    if (params.id === 'listing-123') {
      return HttpResponse.json(mockListing);
    }
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.post('/api/listings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    // Mirror the API's required-field validation.
    const required = ['title', 'description', 'property_type', 'city', 'price_monthly'];
    const missing = required.filter((field) => body[field] == null);
    if (missing.length > 0) {
      return HttpResponse.json(
        { error: 'Validation failed', missing },
        { status: 400 }
      );
    }

    return HttpResponse.json({ ...mockListing, ...body, id: 'new-listing-123' }, { status: 201 });
  }),

  // Matches endpoints
  http.get('/api/matches', () => {
    return HttpResponse.json({ matches: [mockMatch] });
  }),

  http.post('/api/matches', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({ ...mockMatch, seeker_action: body.action });
  }),

  // AI endpoints
  http.post('/api/ai/analyze-photos', () => {
    return HttpResponse.json({
      photos: [
        { detected_room: 'living_room', features: ['sofa', 'tv'], condition_score: 8, quality_score: 9 },
      ],
      overall: { condition_score: 8, style: 'modern', highlights: ['spacious', 'natural light'] },
    });
  }),

  http.post('/api/ai/generate-listing', () => {
    return HttpResponse.json({
      listing: {
        title: 'AI Generated Title',
        description: 'AI generated description...',
        amenities: ['wifi', 'parking'],
      },
    });
  }),

  http.post('/api/ai/chat', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      messages: [
        ...(body.conversation?.messages || []),
        { role: 'user', content: body.message },
        { role: 'assistant', content: 'I understand you are looking for housing. What is your budget?' },
      ],
      extracted_data: { budget_min: 1500, budget_max: 2500 },
      current_topic: 'budget',
      completion_percentage: 25,
    });
  }),

  // User endpoints
  http.get('/api/users/profile', () => {
    return HttpResponse.json(mockUser);
  }),

  http.patch('/api/users/profile', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockUser, ...body });
  }),
];
