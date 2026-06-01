export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Legacy alias
export type ChatMessage = ConversationMessage;

export interface OnboardingConversation {
  messages: ConversationMessage[];
  extracted_data: Partial<{
    profession: string;
    employer: string;
    work_schedule: string;
    budget_min: number;
    budget_max: number;
    move_in_date: string;
    move_out_date: string;
    location_preferences: Record<string, unknown>[];
    must_haves: string[];
    nice_to_haves: string[];
    dealbreakers: string[];
    lifestyle: Record<string, unknown>;
    personality: Record<string, unknown>;
  }>;
  current_topic: string;
  completion_percentage: number;
}

export interface ListingConversation {
  messages: ConversationMessage[];
  extracted_data: Partial<{
    property_type: string;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    price_monthly: number;
    amenities: string[];
    description: string;
    house_rules: string[];
    pet_policy: string;
    available_date: string;
  }>;
  photos_analyzed: boolean;
  completion_percentage: number;
}

export interface VoiceTranscription {
  text: string;
  confidence: number;
  language: string;
  duration_seconds: number;
}

export interface DocumentVerification {
  document_type: 'pay_stub' | 'tax_return' | 'bank_statement' | 'employment_letter' | 'id';
  is_valid: boolean;
  confidence: number;
  extracted_data: Record<string, unknown>;
  issues: string[];
}

// Legacy types from Part 1 kept for backward compatibility
export interface PhotoAnalysisResult {
  roomType: string;
  condition: number;
  features: string[];
  qualityIssues: string[];
  caption: string;
  highlights: string[];
}

export interface ListingGenerationResult {
  title: string;
  headline: string;
  description: string;
  highlights: string[];
  seoKeywords: string[];
}

export interface PricingSuggestion {
  suggested_price: number;
  price_range: { min: number; max: number };
  confidence: number;
  market_percentile: number;
  reasoning: string;
  comparables: Array<{
    price: number;
    bedrooms: number;
    neighborhood: string;
    distance_miles: number;
  }>;
}

export interface DocumentVerificationResult {
  is_authentic: boolean;
  confidence: number;
  document_type: string;
  extracted_data: {
    name?: string;
    income?: number;
    employer?: string;
    date?: string;
  };
  flags: string[];
}

export interface VoiceToListingResult {
  extracted_data: {
    property_type?: string;
    bedrooms?: number;
    bathrooms?: number;
    price_monthly?: number;
    address?: string;
    amenities?: string[];
    description?: string;
    available_date?: string;
  };
  confidence: number;
  missing_info: string[];
}

export interface OnboardingChatResult {
  message: string;
  extracted_data?: Partial<OnboardingConversation['extracted_data']>;
  next_question?: string;
  is_complete: boolean;
}
