import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllProducts } from "@/lib/shopify";

/**
 * Pull the full Shopify catalogue into the local products mirror.
 *
 * Shared by the manual "Sync from Shopify" button and the 5-minute schedule.
 * Uses the service role because the products table is read-only to normal
 * clients. Throws on failure; returns how many products were written.
 */
export async function syncProducts(): Promise<number> {
  const products = await fetchAllProducts();
  if (products.length === 0) return 0;

  const syncedAt = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("products")
    .upsert(
      products.map((p) => ({ ...p, synced_at: syncedAt })),
      { onConflict: "shopify_product_id" }
    );

  if (error) throw new Error(error.message);
  return products.length;
}
