"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAccountStatus } from "@/app/(app)/team/actions";
import type { AccountStatus } from "@/lib/types";

/**
 * Revoke an approved member, or reinstate a declined one. Approving a brand-new
 * signup happens up in PendingApprovals instead.
 */
export function StatusControl({
  userId,
  status,
}: {
  userId: string;
  status: AccountStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const approved = status === "approved";

  function toggle() {
    const next: AccountStatus = approved ? "rejected" : "approved";

    if (
      approved &&
      !window.confirm("Revoke access? They'll be locked out until reinstated.")
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await setAccountStatus(userId, next);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={toggle}
        disabled={pending}
        className={approved ? "btn btn-danger" : "btn btn-ghost"}
      >
        {pending ? "…" : approved ? "Revoke" : "Reinstate"}
      </button>
      {error && (
        <p className="mt-1 max-w-[200px] text-[11px] text-bad">{error}</p>
      )}
    </div>
  );
}
