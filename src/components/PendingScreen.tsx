import { Logo } from "@/components/Logo";
import { signOut } from "@/app/auth/actions";
import { ROLE_LABEL, type Profile } from "@/lib/types";

/**
 * What a signed-in but unapproved account sees instead of the library. RLS
 * already returns nothing for these users; this explains why.
 */
export function PendingScreen({ profile }: { profile: Profile }) {
  const rejected = profile.status === "rejected";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={38} />
        </div>

        <div className="card p-6 text-center">
          <span
            className={`mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full ${
              rejected ? "bg-bad/10" : "bg-accent/10"
            }`}
          >
            {rejected ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="M6.5 6.5l7 7m0-7l-7 7"
                  stroke="var(--bad)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <circle cx="10" cy="10" r="7" stroke="var(--accent)" strokeWidth="1.6" />
                <path
                  d="M10 6.2V10l2.5 1.6"
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>

          <h1 className="text-lg font-semibold tracking-tight">
            {rejected ? "Access declined" : "Waiting for approval"}
          </h1>

          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {rejected
              ? "The owner didn't approve this account. Speak to them if you think that's a mistake."
              : "Your account is with the owner for approval. You'll get access as soon as it's granted — try signing in again a bit later."}
          </p>

          <dl className="mt-6 space-y-2 rounded-lg border border-border bg-surface-2 p-3 text-left text-[13px]">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-faint">Name</dt>
              <dd className="truncate">
                {profile.first_name} {profile.last_name}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-faint">Email</dt>
              <dd className="truncate">{profile.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-faint">Role</dt>
              <dd>{ROLE_LABEL[profile.role]}</dd>
            </div>
          </dl>

          <form action={signOut} className="mt-5">
            <button type="submit" className="btn btn-ghost w-full">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
