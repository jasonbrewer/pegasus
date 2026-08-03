// Hand-written stub matching supabase/migrations/*.sql.
// Once the Supabase project is live, regenerate the authoritative version with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type AccountRole = "freelancer" | "employer";

/** The `type` on an emailed auth link — recovery, signup confirmation, etc. */
export type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";
export type RoleCategory = "on-location" | "regional" | "remote";
export type JobStatus = "draft" | "open" | "closed";
export type RateType = "hourly" | "day" | "flat";
export type PaymentStatus = "unpaid" | "paid" | "waived";
export type ApplicationStatus = "submitted" | "shortlisted" | "rejected" | "hired";
/** 9.1 — whether an account may take part in the marketplace at all. */
export type AccountStatus = "pending" | "approved" | "blocked";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: AccountRole;
          full_name: string;
          avatar_path: string | null;
          status: AccountStatus;
          is_admin: boolean;
          invited_by: string | null;
          // 3.3 — set only on the pending -> approved crossing, by
          // admin_set_account_status(). Null for accounts that never waited.
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          role: AccountRole;
          full_name: string;
        };
        // Only these two columns carry an UPDATE grant — status, is_admin and
        // role are unwritable from the client by design (migration 000010).
        Update: Partial<Pick<Database["public"]["Tables"]["profiles"]["Row"], "full_name" | "avatar_path">>;
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
          credits_html: string | null;
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
      freelancer_videos: {
        Row: {
          id: string;
          freelancer_id: string;
          url: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["freelancer_videos"]["Row"]> & {
          freelancer_id: string;
          url: string;
        };
        Update: Partial<Database["public"]["Tables"]["freelancer_videos"]["Row"]>;
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
          company_network: string;
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
          company_network: string;
          description: string;
          location_zip: string;
          location_lat: number;
          location_lng: number;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
        Relationships: [];
      };
      employer_billing: {
        Row: {
          profile_id: string;
          billing_email: string | null;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["employer_billing"]["Row"]> & {
          profile_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["employer_billing"]["Row"]>;
        Relationships: [];
      };
      freelancer_contacts: {
        Row: {
          profile_id: string;
          phone: string | null;
          contact_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["freelancer_contacts"]["Row"]> & {
          profile_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["freelancer_contacts"]["Row"]>;
        Relationships: [];
      };
      job_titles: {
        Row: {
          job_id: string;
          title: string;
          is_private: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["job_titles"]["Row"]> & {
          job_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["job_titles"]["Row"]>;
        Relationships: [];
      };
      job_contacts: {
        Row: {
          job_id: string;
          contact_name: string;
          contact_email: string | null;
          contact_phone: string | null;
          share_with_applicants: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["job_contacts"]["Row"]> & {
          job_id: string;
          contact_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["job_contacts"]["Row"]>;
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
          credits_html: string | null;
          // Null = Applied, non-null = Viewed. Written only by
          // mark_applicants_viewed().
          first_viewed_at: string | null;
          // Null = active. Set by the applicant withdrawing; cleared only by
          // reapply_to_job(). The one column the client may UPDATE.
          withdrawn_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["applications"]["Row"]> & {
          job_id: string;
          freelancer_id: string;
        };
        // withdrawn_at is the only column with a client UPDATE grant
        // (migration 20260801000011).
        Update: Partial<Pick<Database["public"]["Tables"]["applications"]["Row"], "withdrawn_at">>;
        Relationships: [];
      };
      saved_jobs: {
        Row: {
          freelancer_id: string;
          job_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["saved_jobs"]["Row"]> & {
          freelancer_id: string;
          job_id: string;
        };
        // No Update: the table has no mutable column, and there is no UPDATE
        // policy or grant on it.
        Update: never;
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
          title: string | null;
          company_network: string;
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
          credits_html: string | null;
          created_at: string;
        }[];
      };
      mark_applicants_viewed: {
        Args: { p_job_id: string };
        /** How many applications were stamped as viewed by this call. */
        Returns: number;
      };
      /** The only write path for profiles.status. Admin-gated, raises otherwise. */
      admin_set_account_status: {
        Args: { p_profile_id: string; p_status: AccountStatus };
        Returns: AccountStatus;
      };
      /** Reactivates the caller's own withdrawn application. Rows reactivated. */
      reapply_to_job: {
        Args: { p_job_id: string; p_cover_note: string | null; p_credits_html: string | null };
        Returns: number;
      };
      current_user_is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_participating: {
        Args: { p_profile_id: string };
        Returns: boolean;
      };
    };
  };
}
