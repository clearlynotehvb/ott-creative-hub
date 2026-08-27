"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  preciseMb,
} from "@/lib/media";
import { uploadFile } from "@/lib/upload";
import { captureVideoPoster, extensionOf } from "@/lib/poster";
import {
  ANGLE_SUGGESTIONS,
  RATIOS,
  RATIO_LABEL,
  type AssetRatio,
  type CreativeGroup,
  type CreativeWithRelations,
  type Product,
} from "@/lib/types";

const NEW_GROUP = "__new__";

const ASPECT: Record<AssetRatio, string> = {
  "4:5": "aspect-4/5",
  "1:1": "aspect-square",
  "9:16": "aspect-9/16",
};

/** What's currently in a ratio slot: the stored file, a replacement, or nothing. */
type SlotState = {
  existingId: string | null;
  existingPath: string | null;
  existingPreview: string | null;
  existingName: string | null;
  file: File | null;
  filePreview: string | null;
  removed: boolean;
};

export function EditForm({
  creative,
  products,
  groups,
  knownAngles,
  existingUrls,
}: {
  creative: CreativeWithRelations;
  products: Product[];
  groups: CreativeGroup[];
  knownAngles: string[];
  existingUrls: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [angle, setAngle] = useState(creative.angle ?? "");
  const [groupId, setGroupId] = useState(creative.group_id ?? "");
  const [newGroupName, setNewGroupName] = useState("");
  const [productId, setProductId] = useState(creative.product_id ?? "");
  const [notes, setNotes] = useState(creative.notes ?? "");
  const [destination, setDestination] = useState(creative.destination_url ?? "");

  const [variants, setVariants] = useState(
    [...(creative.creative_copy ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ headline: c.headline, primaryText: c.primary_text }))
  );

  const [slots, setSlots] = useState<Record<AssetRatio, SlotState>>(() => {
    const base = {} as Record<AssetRatio, SlotState>;
    for (const ratio of RATIOS) {
      const asset = (creative.creative_assets ?? []).find(
        (a) => a.ratio === ratio
      );
      base[ratio] = {
        existingId: asset?.id ?? null,
        existingPath: asset?.storage_path ?? null,
        existingPreview: asset
          ? existingUrls[asset.poster_path ?? asset.storage_path] ?? null
          : null,
        existingName: asset?.file_name ?? null,
        file: null,
        filePreview: null,
        removed: false,
      };
    }
    return base;
  });

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function pickFile(ratio: AssetRatio, file: File | null) {
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(
        `"${file.name}" is ${preciseMb(file.size)} MB — the limit is ${MAX_UPLOAD_MB} MB per file. ` +
          "Compress it and try again."
      );
      return;
    }
    setError(null);

    setSlots((prev) => {
      const slot = prev[ratio];
      if (slot.filePreview) URL.revokeObjectURL(slot.filePreview);

      return {
        ...prev,
        [ratio]: {
          ...slot,
          file,
          filePreview: file ? URL.createObjectURL(file) : null,
          removed: false,
        },
      };
    });
  }

  function clearSlot(ratio: AssetRatio) {
    setSlots((prev) => {
      const slot = prev[ratio];
      if (slot.filePreview) URL.revokeObjectURL(slot.filePreview);
      return {
        ...prev,
        [ratio]: { ...slot, file: null, filePreview: null, removed: true },
      };
    });
  }

  function updateVariant(index: number, patch: Partial<(typeof variants)[number]>) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, ...patch } : v))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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

    const remaining = RATIOS.filter((r) => {
      const s = slots[r];
      return s.file || (s.existingId && !s.removed);
    });
    if (remaining.length === 0) {
      return setError("Keep at least one file — 4:5, square, or story.");
    }

    if (groupId === NEW_GROUP && !newGroupName.trim()) {
      return setError("Name the new group, or pick an existing one.");
    }

    setBusy(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      let resolvedGroupId: string | null = groupId || null;

      if (groupId === NEW_GROUP) {
        setStatus("Creating group…");
        const { data: group, error: groupError } = await supabase
          .from("creative_groups")
          .insert({
            name: newGroupName.trim(),
            created_by: auth.user?.id ?? null,
          })
          .select("id")
          .single();
        if (groupError) throw new Error(groupError.message);
        resolvedGroupId = group.id;
      }

      // Storage objects to drop once the database no longer points at them.
      const orphaned: string[] = [];

      for (const ratio of RATIOS) {
        const slot = slots[ratio];
        const slug = ratio.replace(":", "x");

        // Removed outright.
        if (slot.removed && slot.existingId && !slot.file) {
          setStatus(`Removing ${ratio}…`);
          const { error } = await supabase
            .from("creative_assets")
            .delete()
            .eq("id", slot.existingId);
          if (error) throw new Error(error.message);
          if (slot.existingPath) orphaned.push(slot.existingPath);
          continue;
        }

        if (!slot.file) continue;

        const path = `${creative.id}/${slug}.${extensionOf(slot.file)}`;
        setStatus(`Uploading ${ratio}…`);

        await uploadFile(supabase, path, slot.file);

        const kind = slot.file.type.startsWith("video/") ? "video" : "image";
        let posterPath: string | null = null;

        if (kind === "video") {
          setStatus(`Making a thumbnail for ${ratio}…`);
          const poster = await captureVideoPoster(slot.file);
          if (poster) {
            posterPath = `${creative.id}/${slug}-poster.jpg`;
            try {
              await uploadFile(supabase, posterPath, poster);
            } catch {
              posterPath = null;
            }
          }
        }

        const row = {
          creative_id: creative.id,
          ratio,
          storage_path: path,
          file_name: slot.file.name,
          mime_type: slot.file.type || "application/octet-stream",
          file_size: slot.file.size,
          kind,
          poster_path: posterPath,
        };

        if (slot.existingId) {
          const { error } = await supabase
            .from("creative_assets")
            .update(row)
            .eq("id", slot.existingId);
          if (error) throw new Error(error.message);

          // A different file extension means a different object is now unused.
          if (slot.existingPath && slot.existingPath !== path) {
            orphaned.push(slot.existingPath);
          }
        } else {
          const { error } = await supabase.from("creative_assets").insert(row);
          if (error) throw new Error(error.message);
        }
      }

      // Copy variants are small; replacing the set is simpler than diffing it.
      setStatus("Saving copy…");
      const { error: wipeError } = await supabase
        .from("creative_copy")
        .delete()
        .eq("creative_id", creative.id);
      if (wipeError) throw new Error(wipeError.message);

      const copyRows = variants
        .map((v, i) => ({
          creative_id: creative.id,
          headline: v.headline.trim(),
          primary_text: v.primaryText.trim(),
          position: i,
        }))
        .filter((r) => r.headline || r.primary_text);

      if (copyRows.length > 0) {
        const { error } = await supabase.from("creative_copy").insert(copyRows);
        if (error) throw new Error(error.message);
      }

      // Always written, even when unchanged — this is what stamps updated_at.
      setStatus("Saving details…");
      const { error: updateError } = await supabase
        .from("creatives")
        .update({
          title: firstHeadline,
          angle: angle.trim() || null,
          group_id: resolvedGroupId,
          product_id: productId || null,
          notes: notes.trim() || null,
          destination_url: link || null,
        })
        .eq("id", creative.id);
      if (updateError) throw new Error(updateError.message);

      // Best effort — a leftover file is untidy, not broken.
      if (orphaned.length > 0) {
        await supabase.storage.from(BUCKET).remove(orphaned);
      }

      router.push(`/creatives/${creative.id}`);
      router.refresh();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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

      <div className="card p-4">
        <h2 className="text-[13px] font-medium">Files</h2>
        <p className="mb-4 mt-1 text-[12px] text-muted">
          Pick a new file to replace one, or clear a slot to remove it. Keep at
          least one. Max {MAX_UPLOAD_MB} MB per file.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {RATIOS.map((ratio) => (
            <EditSlot
              key={ratio}
              ratio={ratio}
              slot={slots[ratio]}
              disabled={busy}
              onPick={(file) => pickFile(ratio, file)}
              onClear={() => clearSlot(ratio)}
            />
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium">Ad copy</h2>
            <p className="mt-1 text-[12px] text-muted">
              The first headline labels this creative in the grid.
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
                onChange={(e) => updateVariant(i, { primaryText: e.target.value })}
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
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/creatives/${creative.id}`)}
          className="btn btn-ghost"
          disabled={busy}
        >
          Cancel
        </button>
        {busy && status && (
          <span className="text-[12px] text-muted">{status}</span>
        )}
      </div>
    </form>
  );
}

function EditSlot({
  ratio,
  slot,
  disabled,
  onPick,
  onClear,
}: {
  ratio: AssetRatio;
  slot: SlotState;
  disabled: boolean;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = slot.filePreview ?? (slot.removed ? null : slot.existingPreview);
  const isNew = Boolean(slot.file);
  const isVideo = slot.file
    ? slot.file.type.startsWith("video/")
    : false;

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
          preview
            ? "border-border hover:border-border-strong"
            : "border-dashed border-border-strong hover:border-accent"
        }`}
      >
        {preview ? (
          isVideo ? (
            <video src={preview} muted playsInline className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="grid h-full place-items-center px-2 text-center text-[11px] text-faint">
            {slot.removed ? "Removed" : "Add file"}
          </span>
        )}

        {isNew && (
          <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-on-accent">
            NEW
          </span>
        )}
      </button>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[11px] text-muted">{RATIO_LABEL[ratio]}</span>
        {(slot.file || (slot.existingId && !slot.removed)) && (
          <button
            type="button"
            onClick={onClear}
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
