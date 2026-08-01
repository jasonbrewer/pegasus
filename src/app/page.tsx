import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Pegasus</h1>
        <p className="mt-2 max-w-md text-lg text-gray-600">
          A regional, local-first marketplace for hiring freelance video &amp; production talent.
          Richmond, VA / Mid-Atlantic first.
        </p>
      </div>

      <div className="flex gap-3 text-sm font-medium">
        <Link href="/sign-up?role=freelancer" className="rounded-full bg-black px-5 py-3 text-white">
          Join as a freelancer
        </Link>
        <Link href="/sign-up?role=employer" className="rounded-full border border-gray-300 px-5 py-3">
          Post a job
        </Link>
      </div>

      <Link href="/sign-in" className="text-sm text-gray-500 underline">
        Already have an account? Sign in
      </Link>
    </main>
  );
}
