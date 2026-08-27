"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, preciseMb } from "@/lib/media";
import { uploadFile } from "@/lib/upload";
import { captureVideoPoster, extensionOf } from "@/lib/poster";
import {
  ANGLE_SUGGESTIONS,
  RATIOS,
  RATIO_LABEL,
  type AssetRatio,
  type CreativeGroup,
  type Product,
} from "@/lib/types";

type Slot = { file: File; previewUrl: string; kind: "image" | "video" };
type CopyVariant = { headline: string; primaryText: string };

const ASPECT: Record<AssetRatio, string> = {
  "4:5": "aspect-4/5",
  "1:1": "aspect-square",
  "9:16": "aspect-9/16",
};

const NEW_GROUP = "__new__";

export function UploadForm({
  products,
  groups,
  knownAngles,
}: {
  products: Product[];
  groups: CreativeGroup[];
  knownAngles: string[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [angle, setAngle] = useState("");
  const [destination, setDestination] = useState("");
  const [groupId, setGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [productId, setProductId] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<Partial<Record<AssetRatio, Slot>>>({});
  const [variants, setVariants] = useState<CopyVariant[]>([
    { headline: "", primaryText: "" },
  ]);

  const [progress, setProgress] = useState<Partial<Record<AssetRatio, number>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function setSlot(ratio: AssetRatio, file: File | null) {
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(
        `"${file.name}" is ${preciseMb(file.size)} MB — the limit is ${MAX_UPLOAD_MB} MB per file. ` +
          "Compress it and try again."
      );
      return;
    }
    setError(null);

    setSlots((prev) => {
      const next = { ...prev };
      const existing = next[ratio];
      if (existing) URL.revokeObjectURL(existing.previewUrl);

      if (!file) {
        delete next[ratio];
        return next;
      }

      next[ratio] = {
        file,
        previewUrl: URL.createObjectURL(file),
        kind: file.type.startsWith("video/") ? "video" : "image",
      };
      return next;
    });
  }

  function updateVariant(index: number, patch: Partial<CopyVariant>) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, ...patch } : v))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const filled = RATIOS.filter((r) => slots[r]);

    // People paste "shop.com/x" as often as the full URL — accept both.
    const rawLink = destination.trim();
    const hasScheme =
      rawLink.toLowerCase().startsWith("http://") ||
      rawLink.toLowerCase().startsWith("https://");
    const link = rawLink ? (hasScheme ? rawLink : "https://" + rawLink) : "";

    if (link) {
      try {
        new URL(link);
      } catch {
        return setError("That destination link doesn't look like a valid URL.");
      }
    }

    const firstHeadline = variants[0]?.headline.trim() ?? "";
    if (!firstHeadline) {
      return setError("Add a headline — it's how the creative is identified.");
    }
    if (groupId === NEW_GROUP && !newGroupName.trim()) {
      return setError("Name the new group, or pick an existing one.");
    }
    if (filled.length === 0) {
      return setError("Add at least one file — 4:5, square, or story.");
    }

    setBusy(true);
    let creativeId: string | null = null;

    try {
      const { data: user } = await supabase.auth.getUser();

      // A brand-new launch group has to exist before the creative can join it.
      let resolvedGroupId: string | null = groupId || null;

      if (groupId === NEW_GROUP) {
        const name = newGroupName.trim();
        if (!name) throw new Error("Name the new group, or pick an existing one.");

        setStatus("Creating group…");
        const { data: group, error: groupError } = await supabase
          .from("creative_groups")
          .insert({ name, created_by: user.user?.id ?? null })
          .select("id")
          .single();

        if (groupError) throw new Error(groupError.message);
        resolvedGroupId = group.id;
      }

      setStatus("Creating creative…");
      const { data: created, error: createError } = await supabase
        .from("creatives")
        .insert({
          title: firstHeadline,
          angle: angle.trim() || null,
          destination_url: link || null,
          group_id: resolvedGroupId,
          product_id: productId || null,
          notes: notes.trim() || null,
          created_by: user.user?.id ?? null,
        })
        .select("id")
        .single();

      if (createError) throw new Error(createError.message);
      creativeId = created.id;

      // Files go straight from the browser to Supabase Storage — they never
      // pass through a serverless function, so size isn't capped at 4.5 MB.
      const assetRows = [];

      for (const ratio of filled) {
        const slot = slots[ratio]!;
        const slug = ratio.replace(":", "x");
        const path = `${creativeId}/${slug}.${extensionOf(slot.file)}`;

        setStatus(`Uploading ${ratio}…`);

        await uploadFile(supabase, path, slot.file, (fraction) =>
          setProgress((prev) => ({ ...prev, [ratio]: fraction }))
        );

        let posterPath: string | null = null;

        if (slot.kind === "video") {
          setStatus(`Making a thumbnail for ${ratio}…`);
          const poster = await captureVideoPoster(slot.file);

          if (poster) {
            posterPath = `${creativeId}/${slug}-poster.jpg`;
            try {
              await uploadFile(supabase, posterPath, poster);
            } catch {
              // A missing poster is cosmetic — don't fail the whole upload.
              posterPath = null;
            }
          }
        }

        assetRows.push({
          creative_id: creativeId,
          ratio,
          storage_path: path,
          file_name: slot.file.name,
          mime_type: slot.file.type || "application/octet-stream",
          file_size: slot.file.size,
          kind: slot.kind,
          poster_path: posterPath,
        });
      }

      setStatus("Saving details…");

      const { error: assetError } = await supabase
        .from("creative_assets")
        .insert(assetRows);
      if (assetError) throw new Error(assetError.message);

      const copyRows = variants
        .map((v, i) => ({
          creative_id: creativeId!,
          headline: v.headline.trim(),
          primary_text: v.primaryText.trim(),
          position: i,
        }))
        .filter((r) => r.headline || r.primary_text);

      if (copyRows.length > 0) {
        const { error: copyError } = await supabase
          .from("creative_copy")
          .insert(copyRows);
        if (copyError) throw new Error(copyError.message);
      }

      router.push(`/creatives/${creativeId}`);
      router.refresh();
      return;
    } catch (err) {
      // Roll back the half-made creative so the grid never shows a broken card.
      if (creativeId) {
        await supabase.from("creatives").delete().eq("id", creativeId);
      }
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
      setStatus("");
      setProgress({});
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ---- Basics ---- */}
      <div className="card space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="angle">
              Ad angle
            </label>
            <input
              id="angle"
              list="angle-options"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="field"
              placeholder="Social proof"
            />
            <datalist id="angle-options">
              {[...new Set([...knownAngles, ...ANGLE_SUGGESTIONS])].map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label" htmlFor="group">
              Launch group
            </label>
            <select
              id="group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="field"
            >
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value={NEW_GROUP}>+ New group…</option>
            </select>

            {groupId === NEW_GROUP && (
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="field mt-2"
                placeholder="e.g. October ring launch"
                autoFocus
              />
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="destination">
            Destination link{" "}
            <span className="text-faint">— where the ad sends people</span>
          </label>
          <input
            id="destination"
            type="url"
            inputMode="url"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="field"
            placeholder="https://ownthetrend.ca/products/aliza-blue"
          />
        </div>

        <div>
          <label className="label" htmlFor="product">
            Product
          </label>
          <select
            id="product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="field"
          >
            <option value="">No product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.total_inventory != null ? ` · ${p.total_inventory} in stock` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="notes">
            Notes <span className="text-faint">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="field resize-y"
            placeholder="Angle, hook, who it's aimed at…"
          />
        </div>
      </div>

      {/* ---- Files ---- */}
      <div className="card p-4">
        <h2 className="text-[13px] font-medium">Files</h2>
        <p className="mb-4 mt-1 text-[12px] text-muted">
          Image or video in each slot. The 4:5 is what the grid shows — at least
          one slot is required. Max {MAX_UPLOAD_MB} MB per file.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {RATIOS.map((ratio) => (
            <SlotPicker
              key={ratio}
              ratio={ratio}
              slot={slots[ratio]}
              disabled={busy}
              progress={progress[ratio]}
              onPick={(file) => setSlot(ratio, file)}
            />
          ))}
        </div>
      </div>

      {/* ---- Copy ---- */}
      <div className="card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium">Ad copy</h2>
            <p className="mt-1 text-[12px] text-muted">
              One block per variant you want tested. The first headline is
              what labels this creative in the grid.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setVariants((v) => [...v, { headline: "", primaryText: "" }])
            }
            className="btn btn-ghost"
            disabled={busy}
          >
            Add variant
          </button>
        </div>

        <div className="space-y-4">
          {variants.map((variant, i) => (
            <div
              key={i}
              className={`space-y-3 ${i > 0 ? "border-t border-border pt-4" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                  Variant {i + 1}
                </span>
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setVariants((v) => v.filter((_, idx) => idx !== i))
                    }
                    className="text-[11px] text-muted transition hover:text-bad"
                    disabled={busy}
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                value={variant.headline}
                onChange={(e) => updateVariant(i, { headline: e.target.value })}
                className="field"
                placeholder={i === 0 ? "Headline (shown in the grid)" : "Headline"}
                required={i === 0}
                disabled={busy}
              />
              <textarea
                value={variant.primaryText}
                onChange={(e) =>
                  updateVariant(i, { primaryText: e.target.value })
                }
                rows={3}
                className="field resize-y"
                placeholder="Primary text / ad copy"
                disabled={busy}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Uploading…" : "Publish creative"}
        </button>
        {busy && status && (
          <span className="text-[12px] text-muted">{status}</span>
        )}
      </div>
    </form>
  );
}

function SlotPicker({
  ratio,
  slot,
  disabled,
  progress,
  onPick,
}: {
  ratio: AssetRatio;
  slot: Slot | undefined;
  disabled: boolean;
  progress: number | undefined;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={`alpha-grid relative w-full overflow-hidden rounded-lg border transition ${ASPECT[ratio]} ${
          slot
            ? "border-border hover:border-border-strong"
            : "border-dashed border-border-strong hover:border-accent"
        }`}
      >
        {slot ? (
          slot.kind === "video" ? (
            <video
              src={slot.previewUrl}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <span className="grid h-full place-items-center px-2 text-center text-[11px] text-faint">
            Add file
          </span>
        )}

        {slot?.kind === "video" && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
            VIDEO
          </span>
        )}

        {progress !== undefined && progress < 1 && (
          <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 backdrop-blur">
            <span className="block h-1 w-full overflow-hidden rounded-full bg-white/25">
              <span
                className="block h-full bg-white transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            <span className="mt-0.5 block text-center text-[9px] font-medium text-white">
              {Math.round(progress * 100)}%
            </span>
          </span>
        )}
      </button>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[11px] text-muted">{RATIO_LABEL[ratio]}</span>
        {slot && (
          <span className="text-[10px] text-faint">
            {preciseMb(slot.file.size)} MB
          </span>
        )}
        {slot && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="ml-auto text-[11px] text-faint transition hover:text-bad"
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
