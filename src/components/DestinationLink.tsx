"use client";

import { useState } from "react";

/**
 * The URL the ad points at. The buyer copies this straight into the ad set, so
 * copying is the primary action and opening is the check.
 */
export function DestinationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the text is on screen and selectable.
    }
  }

  let display = url;
  try {
    const parsed = new URL(url);
    display = parsed.host + parsed.pathname + parsed.search;
  } catch {
    // Leave it as stored if it won't parse.
  }

  return (
    <div className="card p-4">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        Destination link
      </h2>

      <p className="break-all rounded-lg border border-border bg-bg px-3 py-2.5 font-mono text-[12px] leading-relaxed">
        {display}
      </p>

      <div className="mt-2 flex gap-2">
        <button onClick={copy} className="btn btn-primary flex-1">
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="m3.5 8.5 3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Copied
            </>
          ) : (
            "Copy link"
          )}
        </button>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          title="Open in a new tab"
        >
          Open
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M6 3.5H3.5v9h9V10M9.5 3.5h3v3M12.5 3.5 7 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
