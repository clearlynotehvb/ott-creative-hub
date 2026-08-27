import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/UploadForm";
import {
  canUploadCreatives,
  type CreativeGroup,
  type Product,
  type Profile,
} from "@/lib/types";

export const metadata = { title: "Upload creative · Own The Trend" };
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  // Media buyers are read-only. RLS blocks the write anyway; this just avoids
  // showing them a form that would fail.
  if (!canUploadCreatives(profile?.role)) redirect("/creatives");

  const [{ data: products }, { data: groups }, { data: angleRows }] =
    await Promise.all([
      supabase.from("products").select("*").order("title").returns<Product[]>(),
      supabase
        .from("creative_groups")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<CreativeGroup[]>(),
      supabase
        .from("creatives")
        .select("angle")
        .not("angle", "is", null)
        .returns<{ angle: string }[]>(),
    ]);

  const knownAngles = [
    ...new Set((angleRows ?? []).map((r) => r.angle.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Upload creative
        </h1>
        <p className="mt-1 text-sm text-muted">
          Add the image or video for each placement, then the copy variants your
          buyer will test.
        </p>
      </div>

      {(products ?? []).length === 0 && (
        <div className="card mb-5 border-warn/40 bg-warn/5 p-4 text-sm">
          <p className="text-warn">No products synced yet.</p>
          <p className="mt-1 text-muted">
            You can still upload — the product field will just be empty.{" "}
            <Link href="/products" className="text-accent hover:underline">
              Sync your Shopify catalog
            </Link>{" "}
            to tag creatives with a product.
          </p>
        </div>
      )}

      <UploadForm
        products={products ?? []}
        groups={groups ?? []}
        knownAngles={knownAngles}
      />
    </div>
  );
}
