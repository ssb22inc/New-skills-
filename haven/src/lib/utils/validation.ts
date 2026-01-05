import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email address');

export const phoneSchema = z.string().regex(
  /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
  'Invalid phone number'
);

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const listingSchema = z.object({
  title: z.string().min(10, 'Title must be at least 10 characters').max(100),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000),
  property_type: z.enum(['apartment', 'house', 'condo', 'room', 'townhouse', 'studio']),
  bedrooms: z.number().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10),
  sqft: z.number().min(100).max(50000).optional(),
  address_line1: z.string().min(5),
  city: z.string().min(2),
  state: z.string().length(2),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/),
  price_monthly: z.number().min(100).max(100000),
  available_date: z.string().optional(),
  amenities: z.array(z.string()).default([]),
});

export const seekerProfileSchema = z.object({
  profession: z.string().min(2).optional(),
  employer: z.string().optional(),
  work_schedule: z.enum(['day', 'night', 'rotating', 'flexible', 'remote']).optional(),
  budget_min: z.number().min(0).optional(),
  budget_max: z.number().min(0).optional(),
  move_in_date: z.string().optional(),
  move_out_date: z.string().optional(),
});
