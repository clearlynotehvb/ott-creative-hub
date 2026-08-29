"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCreativeLive } from "@/app/(app)/creatives/actions";

/**
 * On/off switch for whether the ad is running.
 *
 * `compact` renders it inside a grid card, which is itself a link — hence the
 * preventDefault, so flipping the switch doesn't also navigate.
 */
export function LiveToggle({
  id,
  live,
  compact = false,
}: {
  id: string;
  live: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(live);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const next = !on;
    setOn(next); // Optimistic — the switch should feel instant.
    setError(null);

    startTransition(async () => {
      const result = await setCreativeLive(id, next);
      if (result.error) {
        setOn(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const label = on ? "Live" : "Off";

  return (
    <span className={compact ? "contents" : "block"}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        role="switch"
        aria-checked={on}
        aria-label={`Ad is ${label.toLowerCase()} — click to turn ${on ? "off" : "on"}`}
        title={on ? "Running — click to pause" : "Paused — click to set live"}
        className={`flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 transition disabled:opacity-60 ${
          on
            ? "border-good/40 bg-good/10 text-good"
            : "border-border bg-surface-2 text-faint hover:border-border-strong"
        } ${compact ? "" : "w-full justify-center py-1.5"}`}
      >
        <span
          className={`relative inline-flex h-3 w-5 shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-good" : "bg-border-strong"
          }`}
        >
          <span
            className={`absolute h-2 w-2 rounded-full bg-white transition-transform ${
              on ? "translate-x-2.5" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className={compact ? "text-[10px] font-medium" : "text-[12px] font-medium"}>
          {label}
        </span>
      </button>

      {error && !compact && (
        <span className="mt-1 block text-[11px] text-bad">{error}</span>
      )}
    </span>
  );
}
