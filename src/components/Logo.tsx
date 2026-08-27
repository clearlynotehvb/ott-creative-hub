import Image from "next/image";

/**
 * The Own The Trend emblem. The artwork is already #1e4220 on transparency, so
 * it sits directly on the page with no plate behind it.
 */
export function Logo({
  size = 32,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/logo-emblem.png"
        alt="Own The Trend"
        width={size}
        height={size}
        priority
        className="shrink-0"
        style={{ width: size, height: size }}
      />

      {showWordmark && (
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">
            Own The Trend
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-faint">
            Creative Hub
          </div>
        </div>
      )}
    </div>
  );
}
