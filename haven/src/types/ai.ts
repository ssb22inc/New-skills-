export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

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
    location_preferences: any[];
    must_haves: string[];
    nice_to_haves: string[];
    dealbreakers: string[];
    lifestyle: any;
    personality: any;
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
  extracted_data: Record<string, any>;
  issues: string[];
}
