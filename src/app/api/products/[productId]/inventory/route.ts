import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveInventory, shopifyConfigured } from "@/lib/shopify";

/** Live stock for one product, read on demand when a creative is opened. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!shopifyConfigured()) {
    return NextResponse.json(
      { error: "Shopify is not connected", configured: false },
      { status: 503 }
    );
  }

  const { data: product } = await supabase
    .from("products")
    .select("shopify_product_id")
    .eq("id", productId)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  try {
    const inventory = await fetchLiveInventory(product.shopify_product_id);
    if (!inventory) {
      return NextResponse.json(
        { error: "Product no longer exists in Shopify" },
        { status: 404 }
      );
    }
    return NextResponse.json({ configured: true, ...inventory });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shopify request failed" },
      { status: 502 }
    );
  }
}
