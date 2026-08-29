"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { pickThumbnail, displayPath, wasEdited } from "@/lib/media";
import { LiveToggle } from "@/components/LiveToggle";
import type { CreativeWithRelations } from "@/lib/types";

type SortKey = "newest" | "oldest" | "stock_desc" | "stock_asc";

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  stock_desc: "Stock: high to low",
  stock_asc: "Stock: low to high",
};

/** Creatives with no product sort last, whichever way stock is ordered. */
function stockOf(c: CreativeWithRelations): number | null {
  return c.products?.total_inventory ?? null;
}

export function CreativeGrid({
  creatives,
  urls,
  hideGroupFilter = false,
}: {
  creatives: CreativeWithRelations[];
  urls: Record<string, string>;
  hideGroupFilter?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [angle, setAngle] = useState("all");
  const [uploader, setUploader] = useState("all");
  const [liveState, setLiveState] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const products = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of creatives) {
      if (c.products) map.set(c.products.id, c.products.title);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [creatives]);

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of creatives) {
      if (c.creative_groups) map.set(c.creative_groups.id, c.creative_groups.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [creatives]);

  const angles = useMemo(() => {
    const set = new Set<string>();
    for (const c of creatives) {
      if (c.angle?.trim()) set.add(c.angle.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [creatives]);

  const uploaders = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of creatives) {
      if (!c.created_by) continue;
      const name = c.profiles
        ? `${c.profiles.first_name} ${c.profiles.last_name}`.trim()
        : "";
      map.set(c.created_by, name || "Unknown");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [creatives]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = creatives.filter((c) => {
      if (productId !== "all" && c.product_id !== productId) return false;
      if (uploader !== "all" && c.created_by !== uploader) return false;
      if (liveState === "live" && !c.is_live) return false;
      if (liveState === "off" && c.is_live) return false;
      if (groupId !== "all") {
        if (groupId === "none" ? c.group_id : c.group_id !== groupId) return false;
      }
      if (angle !== "all" && (c.angle?.trim() ?? "") !== angle) return false;
      if (!q) return true;

      const haystack = [
        c.title,
        c.angle ?? "",
        c.notes ?? "",
        c.products?.title ?? "",
        c.creative_groups?.name ?? "",
        c.destination_url ?? "",
        ...(c.creative_copy ?? []).flatMap((cp) => [cp.headline, cp.primary_text]),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "stock_desc":
        case "stock_asc": {
          const av = stockOf(a);
          const bv = stockOf(b);
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return sort === "stock_desc" ? bv - av : av - bv;
        }
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });

    return sorted;
  }, [creatives, query, productId, groupId, angle, uploader, liveState, sort]);

  // Sections, newest launch first, with ungrouped work last.
  const sections = useMemo(() => {
    const buckets = new Map<
      string,
      { id: string; name: string; items: CreativeWithRelations[] }
    >();

    for (const c of visible) {
      const id = c.group_id ?? "__none__";
      const name = c.creative_groups?.name ?? "Ungrouped";
      const bucket = buckets.get(id) ?? { id, name, items: [] };
      bucket.items.push(c);
      buckets.set(id, bucket);
    }

    return [...buckets.values()].sort((a, b) => {
      if (a.id === "__none__") return 1;
      if (b.id === "__none__") return -1;
      // Whichever group contains the most recent creative floats to the top.
      const newest = (g: typeof a) =>
        g.items.reduce((max, i) => (i.created_at > max ? i.created_at : max), "");
      return newest(b).localeCompare(newest(a));
    });
  }, [visible]);

  const dirty =
    Boolean(query) ||
    productId !== "all" ||
    groupId !== "all" ||
    angle !== "all" ||
    uploader !== "all" ||
    liveState !== "all" ||
    sort !== "newest";

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search copy, angles, products…"
          className="field max-w-xs"
        />

        <select
          value={liveState}
          onChange={(e) => setLiveState(e.target.value)}
          className="field max-w-[150px]"
        >
          <option value="all">Live and off</option>
          <option value="live">Live only</option>
          <option value="off">Off only</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="field max-w-[190px]"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABEL[key]}
            </option>
          ))}
        </select>

        {!hideGroupFilter && groups.length > 0 && (
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="field max-w-[200px]"
          >
            <option value="all">All groups</option>
            {groups.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value="none">Ungrouped</option>
          </select>
        )}

        {angles.length > 0 && (
          <select
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            className="field max-w-[180px]"
          >
            <option value="all">All angles</option>
            {angles.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        {uploaders.length > 1 && (
          <select
            value={uploader}
            onChange={(e) => setUploader(e.target.value)}
            className="field max-w-[180px]"
          >
            <option value="all">Anyone</option>
            {uploaders.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}

        {products.length > 0 && (
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="field max-w-[200px]"
          >
            <option value="all">All products</option>
            {products.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        )}

        {dirty && (
          <button
            onClick={() => {
              setQuery("");
              setProductId("all");
              setGroupId("all");
              setAngle("all");
              setUploader("all");
              setLiveState("all");
              setSort("newest");
            }}
            className="btn btn-ghost"
          >
            Clear
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-muted">
          No creatives match that filter.
        </div>
      ) : hideGroupFilter ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((creative) => (
            <Card key={creative.id} creative={creative} urls={urls} showGroup={false} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((section) => (
            <details key={section.id} open className="group/sec">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-2 hover:bg-surface-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  className="shrink-0 text-faint transition-transform group-open/sec:rotate-90"
                >
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <span
                  className={
                    section.id === "__none__"
                      ? "text-[13px] font-medium text-muted"
                      : "text-[13px] font-medium"
                  }
                >
                  {section.name}
                </span>

                <span className="chip">
                  {section.items.length} ad{section.items.length === 1 ? "" : "s"}
                </span>

                <span className="ml-2 h-px flex-1 bg-border" />
              </summary>

              <div className="mt-3 mb-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {section.items.map((creative) => (
                  <Card
                    key={creative.id}
                    creative={creative}
                    urls={urls}
                    showGroup={false}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

function Card({
  creative,
  urls,
  showGroup,
}: {
  creative: CreativeWithRelations;
  urls: Record<string, string>;
  showGroup: boolean;
}) {
  const assets = creative.creative_assets ?? [];
  const thumb = pickThumbnail(assets);
  const src = thumb ? urls[displayPath(thumb)] : undefined;

  const copy = [...(creative.creative_copy ?? [])].sort(
    (a, b) => a.position - b.position
  );

  // The grid leads with the ad's primary text; headline and title are only
  // fallbacks for creatives that don't have any yet.
  const caption =
    copy[0]?.primary_text?.trim() ||
    copy[0]?.headline?.trim() ||
    creative.title;

  const variantCount = copy.length;
  const edited = wasEdited(creative.created_at, creative.updated_at);
  const hasVideo = assets.some((a) => a.kind === "video");
  const ratios = assets.map((a) => a.ratio);
  const stock = creative.products?.total_inventory ?? null;

  return (
    <Link
      href={`/creatives/${creative.id}`}
      className={`group card overflow-hidden transition hover:border-border-strong ${
        creative.is_live ? "ring-1 ring-good/30" : ""
      }`}
    >
      <div className="alpha-grid relative aspect-4/5 overflow-hidden">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={creative.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-faint">
            No image
          </div>
        )}

        {hasVideo && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
              <path d="M2 1.2v7.6L8.5 5z" />
            </svg>
            Video
          </span>
        )}

        <span className="absolute left-2 bottom-2">
          <LiveToggle id={creative.id} live={creative.is_live} compact />
        </span>

        <span className="absolute right-2 top-2 flex gap-1">
          {(["4:5", "1:1", "9:16"] as const)
            .filter((r) => ratios.includes(r))
            .map((r) => (
              <span
                key={r}
                className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur"
              >
                {r}
              </span>
            ))}
        </span>
      </div>

      <div className="p-3">
        {(creative.angle || (showGroup && creative.creative_groups)) && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {showGroup && creative.creative_groups && (
              <span className="chip chip-accent">
                {creative.creative_groups.name}
              </span>
            )}
            {creative.angle && <span className="chip">{creative.angle}</span>}
          </div>
        )}

        <p className="line-clamp-3 text-[13px] leading-snug">{caption}</p>

        {creative.products?.title && (
          <div className="mt-2 flex items-baseline gap-1.5 text-[11px]">
            <span className="truncate text-faint">
              {creative.products.title}
            </span>
            <span
              className={`ml-auto shrink-0 tabular-nums ${
                stock === null
                  ? "text-faint"
                  : stock <= 0
                    ? "text-bad"
                    : stock < 10
                      ? "text-warn"
                      : "text-good"
              }`}
            >
              {stock === null ? "—" : `${stock} in stock`}
            </span>
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint">
          {variantCount > 1 && <span>{variantCount} copy variants</span>}
          {edited && <span title="Edited since it was published">Edited</span>}
          {creative.destination_url ? (
            <span className="ml-auto flex items-center gap-1" title="Destination link set">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Link
            </span>
          ) : (
            <span className="ml-auto text-warn" title="No destination link yet">
              No link
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
