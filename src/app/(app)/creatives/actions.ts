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
