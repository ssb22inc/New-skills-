import { describe, it, expect } from 'vitest';
import { emailSchema, phoneSchema, passwordSchema, listingSchema } from '@/lib/utils/validation';

describe('emailSchema', () => {
  it('validates correct emails', () => {
    expect(() => emailSchema.parse('test@example.com')).not.toThrow();
    expect(() => emailSchema.parse('user.name@domain.co.uk')).not.toThrow();
  });

  it('rejects invalid emails', () => {
    expect(() => emailSchema.parse('invalid')).toThrow();
    expect(() => emailSchema.parse('missing@domain')).toThrow();
    expect(() => emailSchema.parse('@nodomain.com')).toThrow();
  });
});

describe('phoneSchema', () => {
  it('validates correct phone numbers', () => {
    expect(() => phoneSchema.parse('123-456-7890')).not.toThrow();
    expect(() => phoneSchema.parse('(123) 456-7890')).not.toThrow();
    expect(() => phoneSchema.parse('+1234567890')).not.toThrow();
  });

  it('rejects invalid phone numbers', () => {
    expect(() => phoneSchema.parse('123')).toThrow();
    expect(() => phoneSchema.parse('abcdefghij')).toThrow();
  });
});

describe('passwordSchema', () => {
  it('validates strong passwords', () => {
    expect(() => passwordSchema.parse('Password1')).not.toThrow();
    expect(() => passwordSchema.parse('MySecure123')).not.toThrow();
  });

  it('rejects weak passwords', () => {
    expect(() => passwordSchema.parse('short')).toThrow(); // too short
    expect(() => passwordSchema.parse('alllowercase1')).toThrow(); // no uppercase
    expect(() => passwordSchema.parse('ALLUPPERCASE1')).toThrow(); // no lowercase
    expect(() => passwordSchema.parse('NoNumbers')).toThrow(); // no number
  });
});

describe('listingSchema', () => {
  const validListing = {
    title: 'Beautiful 2BR apartment',
    description: 'A wonderful apartment with great views and modern amenities. Perfect for travel nurses looking for a comfortable stay near the hospital. Fully furnished with all necessities.',
    property_type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    address_line1: '123 Main Street',
    city: 'Houston',
    state: 'TX',
    zip_code: '77001',
    price_monthly: 2000,
  };

  it('validates correct listings', () => {
    expect(() => listingSchema.parse(validListing)).not.toThrow();
  });

  it('rejects title that is too short', () => {
    expect(() => listingSchema.parse({ ...validListing, title: 'Short' })).toThrow();
  });

  it('rejects description that is too short', () => {
    expect(() => listingSchema.parse({ ...validListing, description: 'Too short' })).toThrow();
  });

  it('rejects invalid property types', () => {
    expect(() => listingSchema.parse({ ...validListing, property_type: 'castle' })).toThrow();
  });

  it('rejects invalid zip codes', () => {
    expect(() => listingSchema.parse({ ...validListing, zip_code: '123' })).toThrow();
  });

  it('rejects prices out of range', () => {
    expect(() => listingSchema.parse({ ...validListing, price_monthly: 50 })).toThrow();
    expect(() => listingSchema.parse({ ...validListing, price_monthly: 200000 })).toThrow();
  });
});
