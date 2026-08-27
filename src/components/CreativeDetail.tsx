"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyField } from "@/components/CopyField";
import { InventoryPanel } from "@/components/InventoryPanel";
import { deleteCreative } from "@/app/(app)/creatives/actions";
import { displayPath, formatBytes } from "@/lib/media";
import {
  RATIOS,
  RATIO_LABEL,
  type AssetRatio,
  type CreativeWithRelations,
} from "@/lib/types";

const ASPECT: Record<AssetRatio, string> = {
  "4:5": "aspect-4/5",
  "1:1": "aspect-square",
  "9:16": "aspect-9/16",
};

export function CreativeDetail({
  creative,
  urls,
  canManage,
}: {
  creative: CreativeWithRelations;
  urls: Record<string, string>;
  canManage: boolean;
}) {
  const assets = creative.creative_assets ?? [];
  const available = RATIOS.filter((r) => assets.some((a) => a.ratio === r));
  const [active, setActive] = useState<AssetRatio>(available[0] ?? "4:5");

  const asset = assets.find((a) => a.ratio === active) ?? null;
  const copy = [...(creative.creative_copy ?? [])].sort(
    (a, b) => a.position - b.position
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ---------------- Media viewer ---------------- */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {RATIOS.map((ratio) => {
            const has = available.includes(ratio);
            return (
              <button
                key={ratio}
                onClick={() => has && setActive(ratio)}
                disabled={!has}
                className={`rounded-lg border px-3 py-1.5 text-[12px] transition ${
                  active === ratio && has
                    ? "border-accent bg-accent/10 text-text"
                    : has
                      ? "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text"
                      : "cursor-not-allowed border-dashed border-border text-faint opacity-60"
                }`}
              >
                {RATIO_LABEL[ratio]}
                {!has && <span className="ml-1.5 text-[10px]">· missing</span>}
              </button>
            );
          })}
        </div>

        <div className="card overflow-hidden p-3">
          {asset ? (
            <MediaFrame asset={asset} urls={urls} />
          ) : (
            <div className="grid h-64 place-items-center text-sm text-faint">
              No file in this slot
            </div>
          )}

          {asset && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[11px] text-faint">
              <span className="truncate font-mono">{asset.file_name}</span>
              <span>{formatBytes(asset.file_size)}</span>
              <span className="uppercase">{asset.kind}</span>
              <a
                href={`/api/download/${asset.id}`}
                className="btn btn-ghost ml-auto"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M8 2.5v8m0 0 3-3m-3 3-3-3M2.5 12.5h11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Download original
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Sidebar ---------------- */}
      <div className="space-y-4">
        <div className="card p-4">
          <h1 className="text-base font-semibold leading-snug tracking-tight">
            {copy[0]?.headline?.trim() || creative.title}
          </h1>
          {(creative.creative_groups || creative.angle) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {creative.creative_groups && (
                <Link
                  href={`/groups/${creative.creative_groups.id}`}
                  className="chip chip-accent hover:underline"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor" />
                    <rect x="7" y="1" width="4" height="4" rx="1" fill="currentColor" />
                    <rect x="1" y="7" width="4" height="4" rx="1" fill="currentColor" />
                    <rect x="7" y="7" width="4" height="4" rx="1" fill="currentColor" />
                  </svg>
                  {creative.creative_groups.name}
                </Link>
              )}
              {creative.angle && <span className="chip">{creative.angle}</span>}
            </div>
          )}

          <p className="mt-1.5 text-[11px] text-faint">
            Added{" "}
            {new Date(creative.created_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {creative.profiles &&
              ` · ${creative.profiles.first_name} ${creative.profiles.last_name}`}
          </p>

          {creative.notes && (
            <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-[13px] leading-relaxed text-muted">
              {creative.notes}
            </p>
          )}

          {assets.length > 1 && (
            <a
              href={`/api/creatives/${creative.id}/download-all`}
              className="btn btn-ghost mt-4 w-full"
            >
              Download all {assets.length} files (.zip)
            </a>
          )}
        </div>

        {creative.products && (
          <div className="card p-4">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Product
            </h2>

            <div className="mb-4 flex items-center gap-3">
              {creative.products.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={creative.products.image_url}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">
                  {creative.products.title}
                </p>
                {creative.products.price != null && (
                  <p className="text-[11px] text-faint">
                    {Number(creative.products.price).toLocaleString()}{" "}
                    {creative.products.currency ?? ""}
                  </p>
                )}
              </div>
            </div>

            <InventoryPanel
              key={creative.products.id}
              productId={creative.products.id}
            />
          </div>
        )}

        <div className="card p-4">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Ad copy
            {copy.length > 1 && (
              <span className="ml-1.5">· {copy.length} variants</span>
            )}
          </h2>

          {copy.length === 0 ? (
            <p className="text-[13px] text-faint">No copy added yet.</p>
          ) : (
            <div className="space-y-5">
              {copy.map((variant, i) => (
                <div
                  key={variant.id}
                  className={i > 0 ? "border-t border-border pt-5" : ""}
                >
                  {copy.length > 1 && (
                    <p className="mb-2 text-[11px] font-medium text-muted">
                      Variant {i + 1}
                    </p>
                  )}
                  <div className="space-y-3">
                    <CopyField label="Headline" value={variant.headline} />
                    <CopyField label="Primary text" value={variant.primary_text} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canManage && <DeleteForm id={creative.id} />}
      </div>
    </div>
  );
}

function DeleteForm({ id }: { id: string }) {
  return (
    <form
      action={deleteCreative}
      onSubmit={(e) => {
        const ok = window.confirm(
          "Delete this creative and all of its files? This cannot be undone."
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-danger w-full">
        Delete creative
      </button>
    </form>
  );
}

function MediaFrame({
  asset,
  urls,
}: {
  asset: CreativeWithRelations["creative_assets"][number];
  urls: Record<string, string>;
}) {
  const box = `alpha-grid relative mx-auto w-full max-h-[70vh] overflow-hidden rounded-lg ${ASPECT[asset.ratio]}`;

  if (asset.kind === "video") {
    const src = urls[asset.storage_path];
    const poster = asset.poster_path ? urls[asset.poster_path] : undefined;

    return (
      <div className={box}>
        {src ? (
          <video
            key={asset.id}
            src={src}
            poster={poster}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-faint">
            Video unavailable
          </div>
        )}
      </div>
    );
  }

  const src = urls[displayPath(asset)];

  return (
    <div className={box}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={asset.file_name}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-faint">
          Image unavailable
        </div>
      )}
    </div>
  );
}
