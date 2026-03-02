import type { Database, PropertyType, FurnitureStatus, ListingStatus } from './database'

export type Listing = Database['public']['Tables']['listings']['Row']
export type ListingPhoto = Database['public']['Tables']['listing_photos']['Row']

export interface ListingWithPhotos extends Listing {
  photos: ListingPhoto[]
}

export interface ListingFormData {
  title: string
  property_type: PropertyType
  bedrooms: number
  bathrooms: number
  sqft?: number
  address_line1: string
  address_line2?: string
  city: string
  state: string
  zip_code: string
  neighborhood?: string
  price_monthly: number
  security_deposit?: number
  utilities_included: boolean
  utilities_estimate?: number
  available_date?: string
  minimum_stay_days: number
  maximum_stay_days?: number
  furniture_status: FurnitureStatus
  amenities: string[]
  house_rules: string[]
  pet_policy?: string
  smoking_policy?: string
  description?: string
  headline?: string
}

export interface ListingFilters {
  city?: string
  state?: string
  min_price?: number
  max_price?: number
  bedrooms?: number
  property_type?: PropertyType
  available_date?: string
  amenities?: string[]
  pet_policy?: string
  furniture_status?: FurnitureStatus
  status?: ListingStatus
}

export interface AIListingAnalysis {
  condition_score: number
  style: string
  highlights: string[]
  target_demographics: string[]
  seo_keywords: string[]
  suggested_title?: string
  suggested_headline?: string
  suggested_description?: string
}
