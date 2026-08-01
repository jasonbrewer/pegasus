// Hand-written stub matching supabase/migrations/*.sql.
// Once the Supabase project is live, regenerate the authoritative version with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type AccountRole = "freelancer" | "employer";
export type RoleCategory = "on-location" | "regional" | "remote";
export type JobStatus = "draft" | "open" | "closed";
export type RateType = "hourly" | "day" | "flat";
export type PaymentStatus = "unpaid" | "paid" | "waived";
export type ApplicationStatus = "submitted" | "shortlisted" | "rejected" | "hired";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: AccountRole;
          full_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          role: AccountRole;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          slug: string;
          label: string;
          category: RoleCategory;
          role_group: string;
          sort_order: number;
        };
        Insert: Database["public"]["Tables"]["roles"]["Row"];
        Update: Partial<Database["public"]["Tables"]["roles"]["Row"]>;
        Relationships: [];
      };
      freelancer_profiles: {
        Row: {
          profile_id: string;
          bio: string | null;
          day_rate_cents: number | null;
          home_zip: string;
          home_lat: number;
          home_lng: number;
          travel_radius_miles: number;
          reel_url: string | null;
          portfolio_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["freelancer_profiles"]["Row"]> & {
          profile_id: string;
          home_zip: string;
          home_lat: number;
          home_lng: number;
        };
        Update: Partial<Database["public"]["Tables"]["freelancer_profiles"]["Row"]>;
        Relationships: [];
      };
      freelancer_roles: {
        Row: {
          freelancer_id: string;
          role_slug: string;
        };
        Insert: Database["public"]["Tables"]["freelancer_roles"]["Row"];
        Update: Partial<Database["public"]["Tables"]["freelancer_roles"]["Row"]>;
        Relationships: [];
      };
      employer_profiles: {
        Row: {
          profile_id: string;
          company_name: string;
          billing_email: string | null;
          stripe_customer_id: string | null;
          home_zip: string | null;
          home_lat: number | null;
          home_lng: number | null;
          description: string | null;
          website: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["employer_profiles"]["Row"]> & {
          profile_id: string;
          company_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["employer_profiles"]["Row"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          employer_id: string;
          role_slug: string;
          title: string;
          description: string;
          location_zip: string;
          location_lat: number;
          location_lng: number;
          travel_expected: boolean;
          start_date: string | null;
          end_date: string | null;
          rate_cents: number | null;
          rate_type: RateType;
          status: JobStatus;
          payment_status: PaymentStatus;
          stripe_checkout_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["jobs"]["Row"]> & {
          employer_id: string;
          role_slug: string;
          title: string;
          description: string;
          location_zip: string;
          location_lat: number;
          location_lng: number;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
        Relationships: [];
      };
      zip_codes: {
        Row: {
          zip: string;
          lat: number;
          lng: number;
          city: string | null;
          state: string | null;
        };
        Insert: Database["public"]["Tables"]["zip_codes"]["Row"];
        Update: Partial<Database["public"]["Tables"]["zip_codes"]["Row"]>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          job_id: string;
          freelancer_id: string;
          status: ApplicationStatus;
          cover_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["applications"]["Row"]> & {
          job_id: string;
          freelancer_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      job_feed: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_miles?: number | null;
          p_role_slug?: string | null;
        };
        Returns: {
          id: string;
          employer_id: string;
          role_slug: string;
          role_category: RoleCategory;
          title: string;
          description: string;
          location_zip: string;
          travel_expected: boolean;
          start_date: string | null;
          end_date: string | null;
          rate_cents: number | null;
          rate_type: RateType;
          status: JobStatus;
          distance_miles: number | null;
          created_at: string;
        }[];
      };
      job_applicants: {
        Args: { p_job_id: string };
        Returns: {
          application_id: string;
          freelancer_id: string;
          full_name: string;
          status: ApplicationStatus;
          distance_miles: number | null;
          cover_note: string | null;
          created_at: string;
        }[];
      };
    };
  };
}
