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
        Insert: Partial<Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
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
        Insert: Partial<Omit<Database['public']['Tables']['seeker_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['seeker_profiles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'seeker_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      landlord_profiles: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          company_name: string | null;
          is_professional: boolean;
          properties_count: number;
          preferred_tenant_types: string[];
          auto_reply_enabled: boolean;
          instant_booking_enabled: boolean;
          stripe_account_id: string | null;
          stripe_onboarding_complete: boolean;
          total_bookings: number;
          average_rating: number | null;
          response_rate: number | null;
          response_time_hours: number | null;
        };
        Insert: Partial<Omit<Database['public']['Tables']['landlord_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['landlord_profiles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'landlord_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: Partial<Omit<Database['public']['Tables']['listings']['Row'], 'id' | 'created_at' | 'updated_at' | 'views_count' | 'inquiries_count' | 'favorites_count'>>;
        Update: Partial<Database['public']['Tables']['listings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'listings_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: Partial<Omit<Database['public']['Tables']['listing_photos']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['listing_photos']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'listing_photos_listing_id_fkey';
            columns: ['listing_id'];
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: Partial<Omit<Database['public']['Tables']['matches']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'matches_seeker_id_fkey';
            columns: ['seeker_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matches_listing_id_fkey';
            columns: ['listing_id'];
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: Partial<Omit<Database['public']['Tables']['bookings']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'bookings_listing_id_fkey';
            columns: ['listing_id'];
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_seeker_id_fkey';
            columns: ['seeker_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_landlord_id_fkey';
            columns: ['landlord_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
        Insert: Partial<Omit<Database['public']['Tables']['conversations']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
        Relationships: [];
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
        Insert: Partial<Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          created_at: string;
          booking_id: string;
          reviewer_id: string;
          reviewee_id: string;
          listing_id: string | null;
          review_type: string;
          overall_rating: number;
          accuracy_rating: number | null;
          communication_rating: number | null;
          cleanliness_rating: number | null;
          location_rating: number | null;
          value_rating: number | null;
          title: string | null;
          content: string | null;
          response: string | null;
          response_at: string | null;
          is_public: boolean;
        };
        Insert: Partial<Omit<Database['public']['Tables']['reviews']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
        Relationships: [];
      };
      verifications: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          verification_type: string;
          status: VerificationStatus;
          document_type: string | null;
          document_storage_path: string | null;
          extracted_data: Json;
          ai_confidence: number | null;
          ai_analysis: Json;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_notes: string | null;
          expires_at: string | null;
          external_verification_id: string | null;
          external_provider: string | null;
        };
        Insert: Partial<Omit<Database['public']['Tables']['verifications']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['verifications']['Insert']>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan_id: string;
          plan_name: string | null;
          status: string;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at: string | null;
          cancelled_at: string | null;
          listings_limit: number | null;
          listings_used: number;
        };
        Insert: Partial<Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [];
      };
      security_alerts: {
        Row: {
          id: string;
          created_at: string;
          alert_type: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          title: string;
          description: string | null;
          ip_address: string | null;
          user_id: string | null;
          request_path: string | null;
          user_agent: string | null;
          metadata: Json;
          resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: Partial<Omit<Database['public']['Tables']['security_alerts']['Row'], 'id'>>;
        Update: Partial<Database['public']['Tables']['security_alerts']['Insert']>;
        Relationships: [];
      };
      blocked_ips: {
        Row: {
          id: string;
          created_at: string;
          ip_address: string;
          reason: string;
          blocked_by: string | null;
          expires_at: string | null;
          metadata: Json;
        };
        Insert: Partial<Omit<Database['public']['Tables']['blocked_ips']['Row'], 'id'>>;
        Update: Partial<Database['public']['Tables']['blocked_ips']['Insert']>;
        Relationships: [];
      };
      consent_records: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          consent_type: string;
          granted: boolean;
          ip_address: string | null;
          user_agent: string | null;
          version: string;
          metadata: Json;
        };
        Insert: Partial<Omit<Database['public']['Tables']['consent_records']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['consent_records']['Insert']>;
        Relationships: [];
      };
      data_deletion_requests: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          requested_at: string;
          completed_at: string | null;
          reason: string | null;
        };
        Insert: Partial<Omit<Database['public']['Tables']['data_deletion_requests']['Row'], 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['data_deletion_requests']['Insert']>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          created_at: string;
          timestamp: string;
          action: string;
          user_id: string | null;
          ip_address: string | null;
          user_agent: string | null;
          resource_type: string | null;
          resource_id: string | null;
          details: Json;
          severity: 'info' | 'warning' | 'critical';
          success: boolean;
        };
        Insert: Partial<Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>>;
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
        Relationships: [];
      };
      processed_webhook_events: {
        Row: {
          stripe_event_id: string;
          processed_at: string;
        };
        Insert: Partial<Database['public']['Tables']['processed_webhook_events']['Row']>;
        Update: Partial<Database['public']['Tables']['processed_webhook_events']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_listing_views: {
        Args: { listing_uuid: string };
        Returns: undefined;
      };
    };
    Enums: {
      user_type: UserType;
      property_type: PropertyType;
      furniture_status: FurnitureStatus;
      listing_status: ListingStatus;
      verification_status: VerificationStatus;
      booking_status: BookingStatus;
      work_schedule: WorkSchedule;
    };
  };
}
