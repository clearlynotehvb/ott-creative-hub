import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllProducts, shopifyConfigured } from "@/lib/shopify";
import { canManageCreatives } from "@/lib/types";

export const maxDuration = 60;

/** Pull the Shopify catalog into the local products mirror. */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canManageCreatives(profile?.role)) {
    return NextResponse.json(
      { error: "Only an Owner or Creative Lead can sync products." },
      { status: 403 }
    );
  }

  if (!shopifyConfigured()) {
    return NextResponse.json(
      {
        error:
          "Shopify is not connected. Add SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.",
      },
      { status: 503 }
    );
  }

  try {
    const products = await fetchAllProducts();

    if (products.length === 0) {
      return NextResponse.json({ synced: 0 });
    }

    // Service role: the products table is read-only to normal clients.
    const admin = createAdminClient();
    const { error } = await admin.from("products").upsert(
      products.map((p) => ({ ...p, synced_at: new Date().toISOString() })),
      { onConflict: "shopify_product_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ synced: products.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 }
    );
  }
}
