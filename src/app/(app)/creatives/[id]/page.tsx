import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/media";
import { CreativeDetail } from "@/components/CreativeDetail";
import { canManageCreatives, type CreativeWithRelations, type Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const SELECT = `
  id, title, angle, product_id, group_id, notes, destination_url, is_live, created_by, created_at, updated_at,
  products ( id, shopify_product_id, title, handle, status, image_url, total_inventory, price, currency, synced_at ),
  creative_assets ( id, creative_id, ratio, storage_path, file_name, mime_type, file_size, kind, poster_path, created_at ),
  creative_copy ( id, creative_id, headline, primary_text, position, created_at ),
  creative_groups ( id, name, notes, created_by, created_at ),
  profiles ( first_name, last_name )
`;

export default async function CreativeDetailPage({
  params,
}: PageProps<"/creatives/[id]">) {
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

  const assets = creative.creative_assets ?? [];

  // Sign both the file itself (for video playback) and the poster frame.
  const paths = assets.flatMap((a) =>
    [a.storage_path, a.poster_path].filter((p): p is string => Boolean(p))
  );
  const urls = await signPaths(supabase, paths);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <Link
        href="/creatives"
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
        All creatives
      </Link>

      <CreativeDetail
        creative={creative}
        urls={urls}
        canManage={
          canManageCreatives(profile?.role) || creative.created_by === user!.id
        }
      />
    </div>
  );
}
