import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Own The Trend" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/creatives";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={38} />
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Access the creative library.
          </p>

          <LoginForm next={next} />
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          No account yet?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
