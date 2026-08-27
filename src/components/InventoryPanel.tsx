"use client";

import { useEffect, useState } from "react";

type Inventory = {
  totalInventory: number | null;
  status: string | null;
  variants: { title: string; sku: string | null; available: number | null }[];
};

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: Inventory };

/**
 * Live stock, read from Shopify when the creative is opened.
 * Mounted with key={productId}, so a different product remounts and refetches
 * rather than needing an in-effect state reset.
 */
export function InventoryPanel({ productId }: { productId: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/products/${productId}/inventory`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load inventory");
        if (!cancelled) setState({ phase: "ready", data: json as Inventory });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ phase: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (state.phase === "loading") {
    return <p className="text-[12px] text-faint">Checking live stock…</p>;
  }

  if (state.phase === "error") {
    return <p className="text-[12px] text-warn">{state.message}</p>;
  }

  const { data } = state;
  const total = data.totalInventory ?? 0;
  const tone = total <= 0 ? "text-bad" : total < 10 ? "text-warn" : "text-good";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tabular-nums ${tone}`}>
          {total}
        </span>
        <span className="text-[12px] text-muted">in stock right now</span>
        {data.status && (
          <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint">
            {data.status}
          </span>
        )}
      </div>

      {data.variants.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {data.variants.map((v, i) => (
            <div
              key={`${v.sku ?? v.title}-${i}`}
              className="flex items-center gap-3 px-2.5 py-1.5 text-[12px]"
            >
              <span className="truncate">{v.title}</span>
              {v.sku && (
                <span className="truncate font-mono text-[10px] text-faint">
                  {v.sku}
                </span>
              )}
              <span
                className={`ml-auto shrink-0 tabular-nums ${
                  (v.available ?? 0) <= 0 ? "text-bad" : "text-muted"
                }`}
              >
                {v.available ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
