import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetRatio, CreativeAsset } from "@/lib/types";

export const BUCKET = "creatives";
export const VIEW_URL_TTL = 60 * 60; // 1 hour

/**
 * Batch-sign storage paths for viewing. The bucket is private, so every
 * <img>/<video> src has to be a signed URL. Returns path -> url.
 */
export async function signPaths(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, VIEW_URL_TTL);

  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const row of data) {
    if (row.signedUrl && row.path) map[row.path] = row.signedUrl;
  }
  return map;
}

/**
 * The image shown in the grid: the 4:5 if it exists, otherwise whatever does.
 * For video slots that means the poster frame captured at upload.
 */
export function pickThumbnail(assets: CreativeAsset[]): CreativeAsset | null {
  if (assets.length === 0) return null;
  const order: AssetRatio[] = ["4:5", "1:1", "9:16"];
  for (const ratio of order) {
    const hit = assets.find((a) => a.ratio === ratio);
    if (hit) return hit;
  }
  return assets[0];
}

/** The path to render for an asset — poster frame for video, file for image. */
export function displayPath(asset: CreativeAsset): string {
  return asset.kind === "video" && asset.poster_path
    ? asset.poster_path
    : asset.storage_path;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/**
 * Hard ceiling for a single upload, enforced by Supabase project-wide (Storage
 * → Settings → Upload file size limit), not by this app. The bucket itself
 * permits 500 MB, so raising the project limit is all that's needed — then bump
 * NEXT_PUBLIC_MAX_UPLOAD_MB to match so the client-side check stays honest.
 *
 * Note this is MiB (1024-based), the same unit Supabase enforces in. Windows
 * labels MiB as "MB", so a file Explorer calls "50 MB" is often just over.
 */
export const MAX_UPLOAD_MB = Number(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 50
);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Precise size for error messages — "50.3 MB", not a rounded "50 MB". */
export function preciseMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
