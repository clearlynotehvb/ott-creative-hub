"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GroupResult = { error: string | null };

/** Create a launch group. RLS restricts this to Owners and Creative Leads. */
export async function createGroup(
  name: string,
  notes: string
): Promise<GroupResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the group a name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("creative_groups").insert({
    name: trimmed,
    notes: notes.trim() || null,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/groups");
  revalidatePath("/creatives");
  return { error: null };
}

/**
 * Delete a group. The creatives inside are kept — the FK is ON DELETE SET NULL,
 * so they simply become ungrouped.
 */
export async function deleteGroup(id: string): Promise<GroupResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("creative_groups").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/groups");
  revalidatePath("/creatives");
  return { error: null };
}
