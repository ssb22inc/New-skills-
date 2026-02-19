import { describe, it, expect } from 'vitest';

describe('Listings API', () => {
  describe('GET /api/listings', () => {
    it('returns paginated listings', async () => {
      const response = await fetch('/api/listings?page=1&limit=10');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.listings).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
    });

    it('filters by city', async () => {
      const response = await fetch('/api/listings?city=Houston');
      const data = await response.json();

      expect(response.status).toBe(200);
      data.listings.forEach((listing: any) => {
        expect(listing.address_city.toLowerCase()).toContain('houston');
      });
    });

    it('filters by price range', async () => {
      const response = await fetch('/api/listings?minPrice=1500&maxPrice=2500');
      const data = await response.json();

      expect(response.status).toBe(200);
      data.listings.forEach((listing: any) => {
        expect(listing.price).toBeGreaterThanOrEqual(1500);
        expect(listing.price).toBeLessThanOrEqual(2500);
      });
    });
  });

  describe('GET /api/listings/:id', () => {
    it('returns a single listing', async () => {
      const response = await fetch('/api/listings/listing-123');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('listing-123');
      expect(data.title).toBeDefined();
    });

    it('returns 404 for non-existent listing', async () => {
      const response = await fetch('/api/listings/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/listings', () => {
    it('creates a new listing', async () => {
      const newListing = {
        title: 'Test Listing Title Here',
        description:
          'A detailed description of the property that is at least 50 characters long for validation.',
        property_type: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        address_line1: '123 Test St',
        address_city: 'Houston',
        address_state: 'TX',
        address_zip: '77001',
        price: 2000,
      };

      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newListing),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.title).toBe(newListing.title);
    });

    it('validates required fields', async () => {
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Short' }), // Missing required fields
      });

      expect(response.status).toBe(400);
    });
  });
});
