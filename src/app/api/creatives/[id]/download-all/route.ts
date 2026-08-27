import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/media";
import type { AssetRatio } from "@/lib/types";

export const runtime = "nodejs";
// 60s is allowed on every Vercel plan. Raise it (up to 300 with Fluid Compute)
// if you start zipping very large video sets.
export const maxDuration = 60;

type Row = {
  storage_path: string;
  file_name: string;
  ratio: AssetRatio;
};

/** Filesystem-safe name for the archive. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "creative"
  );
}

/**
 * Streams every file on a creative as one ZIP.
 *
 * A single download beats N separate ones: browsers block rapid successive
 * downloads, so only the first would ever land. Files are piped straight
 * through from Supabase without buffering, and stored rather than deflated —
 * images and video are already compressed, so this stays fast and keeps memory
 * flat regardless of file size.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: creative } = await supabase
    .from("creatives")
    .select("title, creative_assets ( storage_path, file_name, ratio )")
    .eq("id", id)
    .single<{ title: string; creative_assets: Row[] }>();

  if (!creative) {
    return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  }

  const assets = creative.creative_assets ?? [];
  if (assets.length === 0) {
    return NextResponse.json({ error: "Nothing to download" }, { status: 404 });
  }

  // Sign everything up front so a failure surfaces before the stream opens.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      assets.map((a) => a.storage_path),
      600
    );

  if (signError || !signed) {
    return NextResponse.json(
      { error: "Could not create download links" },
      { status: 500 }
    );
  }

  const urlByPath = new Map(
    signed
      .filter((s) => s.signedUrl && s.path)
      .map((s) => [s.path as string, s.signedUrl])
  );

  const archive = new ZipArchive({ store: true });

  // Feed the archive in the background; the response streams as it fills.
  void (async () => {
    try {
      for (const asset of assets) {
        const url = urlByPath.get(asset.storage_path);
        if (!url) continue;

        const res = await fetch(url);
        if (!res.ok || !res.body) continue;

        archive.append(
          Readable.fromWeb(res.body as unknown as NodeReadableStream),
          { name: `${asset.ratio.replace(":", "x")}-${asset.file_name}` }
        );
      }
      await archive.finalize();
    } catch {
      archive.abort();
    }
  })();

  const body = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slugify(creative.title)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
