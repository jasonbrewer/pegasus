import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Routes a signed-in user to their role's dashboard. The role/employer/freelancer
// dashboards themselves are deliberately bare placeholders — the marketplace UI
// (profile editing, job posting, feed, applicants) is v1 scope built after schema review.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile?.role === "employer" ? "/dashboard/employer" : "/dashboard/freelancer");
}
