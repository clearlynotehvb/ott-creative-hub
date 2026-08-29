import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/media";
import { EditForm } from "@/components/EditForm";
import {
  type AdAngle,
  canManageCreatives,
  type CreativeGroup,
  type CreativeWithRelations,
  type Product,
  type Profile,
} from "@/lib/types";

export const metadata = { title: "Edit creative · Own The Trend" };
export const dynamic = "force-dynamic";

const SELECT = `
  id, title, angle, product_id, group_id, notes, destination_url, is_live, created_by, created_at, updated_at,
  products ( id, shopify_product_id, title, handle, status, image_url, total_inventory, price, currency, synced_at ),
  creative_assets ( id, creative_id, ratio, storage_path, file_name, mime_type, file_size, kind, poster_path, created_at ),
  creative_copy ( id, creative_id, headline, primary_text, position, created_at ),
  creative_groups ( id, name, notes, created_by, created_at ),
  profiles ( first_name, last_name )
`;

export default async function EditCreativePage({
  params,
}: PageProps<"/creatives/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: creative } = await supabase
    .from("creatives")
    .select(SELECT)
    .eq("id", id)
    .single<CreativeWithRelations>();

  if (!creative) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  // Same rule the database enforces: managers, or whoever made it.
  const mayEdit =
    canManageCreatives(profile?.role) || creative.created_by === user!.id;
  if (!mayEdit) redirect(`/creatives/${id}`);

  const [{ data: products }, { data: groups }, { data: angleRows }] =
    await Promise.all([
      supabase.from("products").select("*").order("title").returns<Product[]>(),
      supabase
        .from("creative_groups")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<CreativeGroup[]>(),
      supabase
        .from("ad_angles")
        .select("*")
        .order("position")
        .order("name")
        .returns<AdAngle[]>(),
    ]);

  // Managed in Supabase (table: ad_angles), so the list changes without a deploy.
  const knownAngles = (angleRows ?? []).map((a) => a.name);

  // Existing files are shown as previews, so they need signed URLs.
  const assets = creative.creative_assets ?? [];
  const paths = assets.flatMap((a) =>
    [a.poster_path ?? a.storage_path].filter(Boolean)
  );
  const urls = await signPaths(supabase, paths);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href={`/creatives/${id}`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M10 3.5 5.5 8l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to creative
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Edit creative</h1>
        <p className="mt-1 text-sm text-muted">
          Changes replace what the team sees. The creative is marked as edited
          once you save.
        </p>
      </div>

      <EditForm
        creative={creative}
        products={products ?? []}
        groups={groups ?? []}
        knownAngles={knownAngles}
        existingUrls={urls}
      />
    </div>
  );
}
