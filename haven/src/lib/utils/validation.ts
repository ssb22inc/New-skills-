import { z } from 'zod'

export const emailSchema = z.string().email('Invalid email address')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

export const phoneSchema = z
  .string()
  .regex(/^\+?[\d\s\-().]{10,}$/, 'Invalid phone number')

export const listingSchema = z.object({
  title: z.string().min(10, 'Title must be at least 10 characters').max(100),
  property_type: z.enum(['apartment', 'house', 'condo', 'room', 'townhouse', 'studio']),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0.5).max(20),
  price_monthly: z.number().int().min(100).max(100000),
  address_line1: z.string().min(5),
  city: z.string().min(2),
  state: z.string().length(2),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
})

export const seekerProfileSchema = z.object({
  budget_min: z.number().int().min(0),
  budget_max: z.number().int().min(0),
  move_in_date: z.string().datetime().optional(),
  profession: z.string().optional(),
})
