import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { shopifyConfigured } from "@/lib/shopify";
import { syncProducts } from "@/lib/product-sync";
import { canManageCreatives } from "@/lib/types";

export const maxDuration = 60;

/**
 * Manual "Sync from Shopify". The same sync also runs every 5 minutes via
 * /api/cron/sync-products, so this is only for an immediate refresh.
 */
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
          "Shopify is not connected. Add SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  try {
    const synced = await syncProducts();
    return NextResponse.json({ synced });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 }
    );
  }
}
