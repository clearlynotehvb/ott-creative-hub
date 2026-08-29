"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/media";

/** Delete a creative and everything under it, storage objects included. */
export async function deleteCreative(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("creative_assets")
    .select("storage_path, poster_path")
    .eq("creative_id", id);

  // Rows cascade from the creative; storage objects have to go explicitly.
  const paths = (assets ?? [])
    .flatMap((a) => [a.storage_path, a.poster_path])
    .filter((p): p is string => Boolean(p));

  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }

  const { error } = await supabase.from("creatives").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/creatives");
  redirect("/creatives");
}

export type LiveResult = { error: string | null };

/**
 * Turn an ad on or off.
 *
 * Routed through set_creative_live() rather than a plain update, because any
 * approved user should be able to flip it — the media buyer running the ad
 * usually knows first, and they can't edit the creative itself.
 */
export async function setCreativeLive(
  id: string,
  live: boolean
): Promise<LiveResult> {
  if (!id) return { error: "Invalid request." };

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_creative_live", {
    target_creative: id,
    live,
  });

  if (error) return { error: error.message };

  revalidatePath("/creatives");
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/groups");
  return { error: null };
}
