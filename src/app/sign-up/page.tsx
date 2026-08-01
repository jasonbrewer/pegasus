import Link from "next/link";
import { signUp } from "@/app/auth/actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string }>;
}) {
  const params = await searchParams;
  const role = params.role === "employer" ? "employer" : "freelancer";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Freelance profiles are always free. Employers post jobs (billing stubbed for v1).
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        <Link
          href="/sign-up?role=freelancer"
          className={`flex-1 rounded-md border px-3 py-2 text-center ${
            role === "freelancer" ? "border-black font-medium" : "border-gray-300 text-gray-500"
          }`}
        >
          I&apos;m a freelancer
        </Link>
        <Link
          href="/sign-up?role=employer"
          className={`flex-1 rounded-md border px-3 py-2 text-center ${
            role === "employer" ? "border-black font-medium" : "border-gray-300 text-gray-500"
          }`}
        >
          I&apos;m hiring
        </Link>
      </div>

      {params.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      <form action={signUp} className="flex flex-col gap-3">
        <input type="hidden" name="role" value={role} />

        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input name="full_name" required className="rounded-md border border-gray-300 px-3 py-2" />
        </label>

        {role === "freelancer" ? (
          <label className="flex flex-col gap-1 text-sm">
            Home ZIP
            <input name="home_zip" required className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Company name
            <input name="company_name" required className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="rounded-md border border-gray-300 px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <button type="submit" className="mt-2 rounded-md bg-black px-3 py-2 text-sm font-medium text-white">
          Create account
        </button>
      </form>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
