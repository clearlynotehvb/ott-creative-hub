"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAccountStatus } from "@/app/(app)/team/actions";
import { ROLE_LABEL, type Profile } from "@/lib/types";

export function PendingApprovals({ pending }: { pending: Profile[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function decide(user: Profile, status: "approved" | "rejected") {
    if (
      status === "rejected" &&
      !window.confirm(
        `Decline ${user.first_name} ${user.last_name}? They'll stay signed up but see nothing until you approve them.`
      )
    ) {
      return;
    }

    setError(null);
    setActingOn(user.id);

    startTransition(async () => {
      const result = await setAccountStatus(user.id, status);
      setActingOn(null);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  if (pending.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-medium">Waiting for approval</h2>
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">
          {pending.length}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="card divide-y divide-border overflow-hidden border-accent/40">
        {pending.map((user) => {
          const busy = actingOn === user.id;
          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center gap-3 bg-accent/5 px-4 py-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold">
                {`${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase() ||
                  "?"}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {user.first_name} {user.last_name}
                </p>
                <p className="truncate text-[11px] text-faint">{user.email}</p>
              </div>

              <span className="chip shrink-0">{ROLE_LABEL[user.role]}</span>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => decide(user, "approved")}
                  disabled={busy}
                  className="btn btn-primary"
                >
                  {busy ? "…" : "Approve"}
                </button>
                <button
                  onClick={() => decide(user, "rejected")}
                  disabled={busy}
                  className="btn btn-danger"
                >
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
