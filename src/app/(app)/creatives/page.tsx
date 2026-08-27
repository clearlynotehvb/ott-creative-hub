import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signPaths, pickThumbnail, displayPath } from "@/lib/media";
import { CreativeGrid } from "@/components/CreativeGrid";
import {
  canUploadCreatives,
  type CreativeWithRelations,
  type Profile,
} from "@/lib/types";

export const metadata = { title: "Creatives · Own The Trend" };
export const dynamic = "force-dynamic";

const SELECT = `
  id, title, angle, product_id, group_id, notes, created_by, created_at, updated_at,
  products ( id, shopify_product_id, title, handle, status, image_url, total_inventory, price, currency, synced_at ),
  creative_assets ( id, creative_id, ratio, storage_path, file_name, mime_type, file_size, kind, poster_path, created_at ),
  creative_copy ( id, creative_id, headline, primary_text, position, created_at ),
  creative_groups ( id, name, notes, created_by, created_at ),
  profiles ( first_name, last_name )
`;

export default async function CreativesPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: rows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("creatives")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .returns<CreativeWithRelations[]>(),
  ]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  const creatives = rows ?? [];

  // One signing round-trip for every thumbnail on the page.
  const thumbPaths = creatives
    .map((c) => {
      const thumb = pickThumbnail(c.creative_assets ?? []);
      return thumb ? displayPath(thumb) : null;
    })
    .filter((p): p is string => Boolean(p));

  const urls = await signPaths(supabase, thumbPaths);

  const canUpload = canUploadCreatives(profile?.role);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Creatives</h1>
          <p className="mt-1 text-sm text-muted">
            {creatives.length === 0
              ? "Nothing here yet."
              : `${creatives.length} creative${creatives.length === 1 ? "" : "s"} in the library.`}
          </p>
        </div>

        {canUpload && (
          <Link href="/upload" className="btn btn-primary">
            Upload creative
          </Link>
        )}
      </div>

      {creatives.length === 0 ? (
        <div className="card grid place-items-center px-6 py-20 text-center">
          <div className="max-w-sm">
            <h2 className="text-base font-medium">The library is empty</h2>
            <p className="mt-2 text-sm text-muted">
              {canUpload
                ? "Upload your first creative — a 4:5 for the grid, plus square and story versions if you have them."
                : "Nothing has been uploaded yet. Your creative lead will add work here."}
            </p>
            {canUpload && (
              <Link href="/upload" className="btn btn-primary mt-5">
                Upload creative
              </Link>
            )}
          </div>
        </div>
      ) : (
        <CreativeGrid creatives={creatives} urls={urls} />
      )}
    </div>
  );
}
