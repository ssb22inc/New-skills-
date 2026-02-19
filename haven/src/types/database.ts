export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserType = 'seeker' | 'landlord' | 'both';
export type PropertyType = 'apartment' | 'house' | 'condo' | 'room' | 'townhouse' | 'studio';
export type FurnitureStatus = 'furnished' | 'partially_furnished' | 'unfurnished';
export type ListingStatus = 'draft' | 'active' | 'paused' | 'rented' | 'archived';
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'expired';
export type BookingStatus = 'inquiry' | 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type WorkSchedule = 'day' | 'night' | 'rotating' | 'flexible' | 'remote';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          user_type: UserType;
          onboarding_completed: boolean;
          onboarding_step: number;
          identity_verified: boolean;
          income_verified: boolean;
          background_check_completed: boolean;
          verification_date: string | null;
          email_notifications: boolean;
          sms_notifications: boolean;
          metadata: Json;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      seeker_profiles: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          profession: string | null;
          employer: string | null;
          work_schedule: WorkSchedule | null;
          budget_min: number | null;
          budget_max: number | null;
          move_in_date: string | null;
          move_out_date: string | null;
          lease_flexibility: string | null;
          location_preferences: Json;
          must_haves: string[];
          nice_to_haves: string[];
          dealbreakers: string[];
          lifestyle: Json;
          personality: Json;
          verified_monthly_income: number | null;
          income_verification_date: string | null;
          income_document_type: string | null;
          profile_embedding: number[] | null;
        };
        Insert: Omit<Database['public']['Tables']['seeker_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['seeker_profiles']['Insert']>;
      };
      listings: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          status: ListingStatus;
          published_at: string | null;
          title: string;
          headline: string | null;
          description: string | null;
          property_type: PropertyType;
          bedrooms: number | null;
          bathrooms: number | null;
          sqft: number | null;
          floor_level: number | null;
          year_built: number | null;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          zip_code: string;
          neighborhood: string | null;
          latitude: number | null;
          longitude: number | null;
          price_monthly: number;
          price_weekly: number | null;
          security_deposit: number | null;
          cleaning_fee: number | null;
          utilities_included: boolean;
          utilities_estimate: number | null;
          available_date: string | null;
          minimum_stay_days: number;
          maximum_stay_days: number | null;
          instant_booking: boolean;
          furniture_status: FurnitureStatus;
          amenities: string[];
          house_rules: string[];
          pet_policy: string | null;
          smoking_policy: string | null;
          guest_policy: string | null;
          ai_analysis: Json;
          slug: string | null;
          seo_title: string | null;
          seo_description: string | null;
          views_count: number;
          inquiries_count: number;
          favorites_count: number;
          listing_embedding: number[] | null;
        };
        Insert: Omit<Database['public']['Tables']['listings']['Row'], 'id' | 'created_at' | 'updated_at' | 'views_count' | 'inquiries_count' | 'favorites_count'>;
        Update: Partial<Database['public']['Tables']['listings']['Insert']>;
      };
      listing_photos: {
        Row: {
          id: string;
          listing_id: string;
          created_at: string;
          storage_path: string;
          url: string;
          thumbnail_url: string | null;
          position: number;
          room_type: string | null;
          caption: string | null;
          is_primary: boolean;
          ai_analysis: Json;
        };
        Insert: Omit<Database['public']['Tables']['listing_photos']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['listing_photos']['Insert']>;
      };
      matches: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          seeker_id: string;
          listing_id: string;
          total_score: number;
          lifestyle_score: number | null;
          personality_score: number | null;
          location_score: number | null;
          budget_score: number | null;
          amenity_score: number | null;
          trust_score: number | null;
          score_breakdown: Json;
          ml_adjustment: number;
          ml_confidence: number | null;
          seeker_action: string | null;
          seeker_action_at: string | null;
          landlord_action: string | null;
          landlord_action_at: string | null;
          outcome: string | null;
          outcome_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['matches']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
      };
      bookings: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          listing_id: string;
          seeker_id: string;
          landlord_id: string;
          status: BookingStatus;
          check_in_date: string;
          check_out_date: string;
          monthly_rate: number;
          total_rent: number;
          security_deposit: number | null;
          cleaning_fee: number | null;
          service_fee: number | null;
          total_amount: number;
          stripe_payment_intent_id: string | null;
          payment_status: string | null;
          paid_at: string | null;
          initial_message: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancellation_reason: string | null;
        };
        Insert: Omit<Database['public']['Tables']['bookings']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
      };
      conversations: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          listing_id: string | null;
          booking_id: string | null;
          participant_ids: string[];
          last_message_at: string | null;
          last_message_preview: string | null;
          read_status: Json;
        };
        Insert: Omit<Database['public']['Tables']['conversations']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          created_at: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          message_type: string;
          attachments: Json;
          metadata: Json;
          read_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
    };
  };
}
