import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/media";

/**
 * Hands back a short-lived signed URL with Content-Disposition: attachment, so
 * the original full-quality file downloads straight from Supabase Storage.
 * The bytes never pass through this function — no 4.5 MB response cap, no
 * timeout risk on large video files.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: asset, error } = await supabase
    .from("creative_assets")
    .select("storage_path, file_name")
    .eq("id", assetId)
    .single();

  if (error || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(asset.storage_path, 60, { download: asset.file_name });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Could not create download link" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
