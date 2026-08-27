"use client";

import { useState } from "react";

export function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure origin or denied permission) — the text is
      // on screen and selectable, so there's nothing to recover from.
    }
  }

  if (!value?.trim()) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          {label}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted transition hover:bg-surface-2 hover:text-text"
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="m3.5 8.5 3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                <rect
                  x="5.5" y="5.5" width="8" height="8" rx="1.5"
                  stroke="currentColor" strokeWidth="1.4"
                />
                <path
                  d="M10.5 5.5v-1a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
                />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2.5 text-[13px] leading-relaxed">
        {value}
      </p>
    </div>
  );
}
