import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { shopifyConfigured } from "@/lib/shopify";
import { syncProducts } from "@/lib/product-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scheduled product sync. Supabase's pg_cron calls this every 5 minutes;
 * Vercel Cron would call it the same way on a paid plan.
 *
 * There is no user session here, so the proxy skips this path and the request
 * is authenticated by CRON_SECRET instead.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // Constant-time compare, so the secret can't be guessed from response timing.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!shopifyConfigured()) {
    return NextResponse.json(
      { error: "Shopify is not connected." },
      { status: 503 }
    );
  }

  const started = Date.now();
  try {
    const synced = await syncProducts();
    return NextResponse.json({ synced, ms: Date.now() - started });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 }
    );
  }
}

export const GET = handle;
export const POST = handle;
