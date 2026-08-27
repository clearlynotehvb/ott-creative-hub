import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signPaths, pickThumbnail, displayPath } from "@/lib/media";
import { CreativeGrid } from "@/components/CreativeGrid";
import type { CreativeGroup, CreativeWithRelations } from "@/lib/types";

export const dynamic = "force-dynamic";

const SELECT = `
  id, title, angle, product_id, group_id, notes, destination_url, created_by, created_at, updated_at,
  products ( id, shopify_product_id, title, handle, status, image_url, total_inventory, price, currency, synced_at ),
  creative_assets ( id, creative_id, ratio, storage_path, file_name, mime_type, file_size, kind, poster_path, created_at ),
  creative_copy ( id, creative_id, headline, primary_text, position, created_at ),
  creative_groups ( id, name, notes, created_by, created_at ),
  profiles ( first_name, last_name )
`;

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("creative_groups")
    .select("*")
    .eq("id", id)
    .single<CreativeGroup>();

  if (!group) notFound();

  const { data: rows } = await supabase
    .from("creatives")
    .select(SELECT)
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .returns<CreativeWithRelations[]>();

  const creatives = rows ?? [];

  const thumbPaths = creatives
    .map((c) => {
      const thumb = pickThumbnail(c.creative_assets ?? []);
      return thumb ? displayPath(thumb) : null;
    })
    .filter((p): p is string => Boolean(p));

  const urls = await signPaths(supabase, thumbPaths);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <Link
        href="/groups"
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
        All groups
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{group.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {creatives.length === 0
            ? "Nothing in this group yet."
            : `${creatives.length} creative${
                creatives.length === 1 ? "" : "s"
              } launching together.`}
        </p>
        {group.notes && (
          <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-muted">
            {group.notes}
          </p>
        )}
      </div>

      {creatives.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-muted">
          Pick this group when uploading a creative to add it here.
        </div>
      ) : (
        <CreativeGrid creatives={creatives} urls={urls} hideGroupFilter />
      )}
    </div>
  );
}
