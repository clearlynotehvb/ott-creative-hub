"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp, type AuthState } from "@/app/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";
import type { UserRole } from "@/lib/types";

const initial: AuthState = { error: null };

const ROLES: { value: UserRole; label: string; blurb: string }[] = [
  {
    value: "media_buyer",
    label: "Media Buyer",
    blurb: "Browse, copy ad text, download originals, and upload your own.",
  },
  {
    value: "graphic_designer",
    label: "Graphic Designer",
    blurb: "Same as a Media Buyer — upload creatives and manage your own.",
  },
  {
    value: "creative_lead",
    label: "Creative Lead",
    blurb: "Everything above, plus edit anyone's work and sync products.",
  },
  {
    value: "owner",
    label: "Owner",
    blurb: "Full access, including team roles and product sync.",
  },
];

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, initial);
  const [role, setRole] = useState<UserRole>("media_buyer");

  if (state.message) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-good/10">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="m5.5 10.5 3 3 6-7"
              stroke="var(--good)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h1 className="text-lg font-semibold tracking-tight">Account created</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {state.message}
        </p>

        <Link href="/login" className="btn btn-ghost mt-5 w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pick the role that matches what you do.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="first_name">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            required
            className="field"
            autoComplete="given-name"
            placeholder="Amr"
          />
        </div>
        <div>
          <label className="label" htmlFor="last_name">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            required
            className="field"
            autoComplete="family-name"
            placeholder="Fahmy"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="field"
          autoComplete="email"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="field"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <span className="label">Role</span>
        <input type="hidden" name="role" value={role} />
        <div className="space-y-2">
          {ROLES.map((r) => {
            const active = role === r.value;
            return (
              <button
                type="button"
                key={r.value}
                onClick={() => setRole(r.value)}
                aria-pressed={active}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface-2 hover:border-border-strong"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full border ${
                      active ? "border-accent" : "border-border-strong"
                    }`}
                  >
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-accent" />
                    )}
                  </span>
                  <span className="text-sm font-medium">{r.label}</span>
                </span>
                <span className="mt-1 block pl-6 text-xs text-muted">
                  {r.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
