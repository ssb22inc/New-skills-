export interface PhotoAnalysisResult {
  roomType: string
  condition: number
  features: string[]
  qualityIssues: string[]
  caption: string
  highlights: string[]
}

export interface ListingGenerationResult {
  title: string
  headline: string
  description: string
  highlights: string[]
  seoKeywords: string[]
}

export interface PricingSuggestion {
  suggested_price: number
  price_range: { min: number; max: number }
  confidence: number
  market_percentile: number
  reasoning: string
  comparables: Array<{
    price: number
    bedrooms: number
    neighborhood: string
    distance_miles: number
  }>
}

export interface DocumentVerificationResult {
  is_authentic: boolean
  confidence: number
  document_type: string
  extracted_data: {
    name?: string
    income?: number
    employer?: string
    date?: string
  }
  flags: string[]
}

export interface VoiceToListingResult {
  extracted_data: {
    property_type?: string
    bedrooms?: number
    bathrooms?: number
    price_monthly?: number
    address?: string
    amenities?: string[]
    description?: string
    available_date?: string
  }
  confidence: number
  missing_info: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface OnboardingChatResult {
  message: string
  extracted_data?: Partial<{
    profession: string
    budget_min: number
    budget_max: number
    move_in_date: string
    location_preferences: Array<{ city: string; neighborhoods?: string[] }>
    lifestyle: Record<string, unknown>
    must_haves: string[]
    dealbreakers: string[]
  }>
  next_question?: string
  is_complete: boolean
}
