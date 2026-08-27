import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create account · Own The Trend" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={38} />
        </div>

        {/* The heading lives inside the form — it changes once the account
            exists, and a "pick your role" prompt over a success message reads
            as a contradiction. */}
        <div className="card p-6">
          <SignupForm />
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
