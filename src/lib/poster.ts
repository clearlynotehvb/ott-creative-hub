/**
 * Grab a still from a video in the browser so the grid has a thumbnail.
 * Runs client-side at upload time — the server never touches the video bytes.
 */
export async function captureVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    // Never let a stubborn codec hang the whole upload.
    const timer = setTimeout(() => finish(null), 10_000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    video.onloadeddata = () => {
      // A hair into the clip — frame 0 is often black.
      video.currentTime = Math.min(0.2, (video.duration || 1) / 4);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height) {
          clearTimeout(timer);
          return finish(null);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            clearTimeout(timer);
            finish(blob);
          },
          "image/jpeg",
          0.85
        );
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };

    video.src = url;
  });
}

/** File extension, lowercased, without the dot. */
export function extensionOf(file: File): string {
  const match = /\.([a-z0-9]+)$/i.exec(file.name);
  return match ? match[1].toLowerCase() : "bin";
}
