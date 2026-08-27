import * as tus from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "@/lib/media";

/**
 * Supabase's resumable endpoint requires exactly 6 MB chunks — not a tunable.
 * Below one chunk there's nothing to resume, so small files take the simpler
 * single-request path.
 */
const CHUNK_SIZE = 6 * 1024 * 1024;

export type ProgressFn = (fraction: number) => void;

/**
 * Upload straight from the browser to Supabase Storage.
 *
 * Files over one chunk go through TUS (resumable): the transfer is split into
 * 6 MB pieces that retry individually and pick up where they left off after a
 * dropped connection, instead of restarting a multi-minute request from zero.
 * Everything bypasses the app server, so Vercel's 4.5 MB body cap never applies.
 */
export async function uploadFile(
  supabase: SupabaseClient,
  path: string,
  file: File | Blob,
  onProgress?: ProgressFn
): Promise<void> {
  const contentType =
    ("type" in file && file.type) || "application/octet-stream";

  if (file.size <= CHUNK_SIZE) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType, upsert: true });

    if (error) throw new Error(error.message);
    onProgress?.(1);
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Your session expired — sign in again.");

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      onError: (error) => {
        const message = error.message ?? String(error);
        // Phrase the size cap as something the uploader can act on; raising
        // the ceiling is an admin job, not theirs.
        reject(
          /exceeded the maximum allowed size/i.test(message)
            ? new Error(
                "That file is over the upload limit. Compress it and try again."
              )
            : new Error(message)
        );
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });

    // Resume an interrupted attempt at the same path rather than restarting.
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
