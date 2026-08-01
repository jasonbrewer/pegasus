import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function FreelancerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("freelancer_profiles")
    .select("home_zip, travel_radius_miles")
    .eq("profile_id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Freelancer dashboard</h1>
      <p className="text-sm text-gray-500">
        Signed in as {user.email}. Home ZIP: {profile?.home_zip || "not set"}. Travel radius:{" "}
        {profile?.travel_radius_miles ?? 25} miles.
      </p>
      <p className="text-sm text-gray-500">
        Profile editing, the job feed, and applying to jobs land after the v1 schema is reviewed.
      </p>
      <form action={signOut}>
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
