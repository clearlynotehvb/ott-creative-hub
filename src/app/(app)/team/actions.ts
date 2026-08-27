"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = [
  "owner",
  "creative_lead",
  "graphic_designer",
  "media_buyer",
];

export type RoleResult = { error: string | null };

/**
 * Role changes go through set_user_role(), which checks the caller is an Owner
 * and refuses to demote the last one. The `role` column isn't writable by
 * `authenticated` at all, so this is the only path — a hand-rolled API call
 * can't get around it.
 */
export async function updateRole(
  userId: string,
  role: UserRole
): Promise<RoleResult> {
  if (!userId || !VALID_ROLES.includes(role)) {
    return { error: "Invalid request." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_user_role", {
    target_user: userId,
    new_role: role,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/team");
  return { error: null };
}

const VALID_STATUSES: AccountStatus[] = ["pending", "approved", "rejected"];

/**
 * Approve or decline a signup. set_account_status() checks the caller is an
 * Owner and refuses self-changes; `status` isn't in the column grants for
 * `authenticated`, so this is the only route.
 */
export async function setAccountStatus(
  userId: string,
  status: AccountStatus
): Promise<RoleResult> {
  if (!userId || !VALID_STATUSES.includes(status)) {
    return { error: "Invalid request." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_account_status", {
    target_user: userId,
    new_status: status,
  });

  if (error) return { error: error.message };

  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { error: null };
}
