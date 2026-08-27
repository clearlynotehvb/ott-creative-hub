"use client";

import { useState, useTransition } from "react";
import { updateRole } from "@/app/(app)/team/actions";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

const ROLES: UserRole[] = [
  "media_buyer",
  "graphic_designer",
  "creative_lead",
  "owner",
];

export function RoleSelect({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const [value, setValue] = useState<UserRole>(role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: UserRole) {
    const previous = value;
    setValue(next);
    setError(null);

    startTransition(async () => {
      const result = await updateRole(userId, next);
      if (result.error) {
        setValue(previous); // The server said no — put the select back.
        setError(result.error);
      }
    });
  }

  return (
    <div className="shrink-0 text-right">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as UserRole)}
        className="field w-[150px] py-1.5 text-[12px]"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 max-w-[220px] text-[11px] text-bad">{error}</p>
      )}
    </div>
  );
}
