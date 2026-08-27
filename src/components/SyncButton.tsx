"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/shopify/sync", { method: "POST" });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Sync failed");

      setMessage(`Synced ${json.synced} products.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button onClick={sync} className="btn btn-primary" disabled={busy}>
        {busy ? "Syncing…" : "Sync from Shopify"}
      </button>
      {message && <span className="text-[12px] text-good">{message}</span>}
      {error && (
        <span className="max-w-xs text-right text-[12px] text-bad">{error}</span>
      )}
    </div>
  );
}
