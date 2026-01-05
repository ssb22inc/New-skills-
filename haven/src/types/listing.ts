import { Database, PropertyType, FurnitureStatus, ListingStatus } from './database';

export type Listing = Database['public']['Tables']['listings']['Row'];
export type ListingInsert = Database['public']['Tables']['listings']['Insert'];
export type ListingUpdate = Database['public']['Tables']['listings']['Update'];
export type ListingPhoto = Database['public']['Tables']['listing_photos']['Row'];

export interface ListingWithPhotos extends Listing {
  photos: ListingPhoto[];
  landlord?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    response_rate?: number;
    response_time_hours?: number;
  };
}

export interface ListingFilters {
  city?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: PropertyType;
  furnitureStatus?: FurnitureStatus;
  amenities?: string[];
  availableFrom?: string;
  availableTo?: string;
  instantBooking?: boolean;
  petsAllowed?: boolean;
}

export interface ListingSearchParams extends ListingFilters {
  query?: string;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'relevance';
  page?: number;
  limit?: number;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
}

export interface AIListingAnalysis {
  condition_score: number;
  style: string;
  highlights: string[];
  concerns: string[];
  target_demographics: string[];
  seo_keywords: string[];
  suggested_price_range: {
    min: number;
    max: number;
    confidence: number;
  };
}

export interface PhotoAnalysis {
  detected_room: string;
  features: string[];
  condition_score: number;
  quality_score: number;
  quality_issues: string[];
  suggested_caption: string;
}

export interface GeneratedListing {
  title: string;
  headline: string;
  description: string;
  amenities: string[];
  highlights: string[];
  seo_title: string;
  seo_description: string;
}
