"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

const initial: AuthState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
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
          autoComplete="current-password"
          required
          className="field"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
