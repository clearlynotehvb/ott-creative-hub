"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

const FORMATS: Record<"date" | "datetime", Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  datetime: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
};

/**
 * A timestamp in the viewer's own timezone and locale.
 *
 * Formatting has to happen in the browser: the server runs on UTC, so a date
 * formatted there shows UTC to everyone, three hours off for a team in Egypt.
 * The server snapshot renders nothing, and the client fills in the local time
 * as soon as it hydrates, so the two never disagree.
 */
export function LocalTime({
  iso,
  mode = "datetime",
}: {
  iso: string;
  mode?: "date" | "datetime";
}) {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );

  return (
    <time dateTime={iso}>
      {inBrowser ? new Date(iso).toLocaleString(undefined, FORMATS[mode]) : ""}
    </time>
  );
}
