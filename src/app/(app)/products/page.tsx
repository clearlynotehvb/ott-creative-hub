import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SyncButton } from "@/components/SyncButton";
import { canManageCreatives, type Product, type Profile } from "@/lib/types";

export const metadata = { title: "Products · Own The Trend" };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  if (!canManageCreatives(profile?.role)) redirect("/creatives");

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("title")
    .returns<Product[]>();

  const rows = products ?? [];
  const lastSync = rows.reduce<string | null>(
    (latest, p) => (!latest || p.synced_at > latest ? p.synced_at : latest),
    null
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length > 0
              ? `${rows.length} products from Shopify${
                  lastSync
                    ? ` · last synced ${new Date(lastSync).toLocaleString()} · updates every 5 minutes`
                    : ""
                }`
              : "Your Shopify catalog loads here automatically within 5 minutes."}
          </p>
        </div>
        <SyncButton />
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-muted">
          Nothing synced yet. The catalog updates from Shopify every 5 minutes, or hit “Sync from Shopify” to load it now.
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-md border border-border bg-surface-2" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{p.title}</p>
                {p.price != null && (
                  <p className="text-[11px] text-faint">
                    {Number(p.price).toLocaleString()} {p.currency ?? ""}
                  </p>
                )}
              </div>

              {p.status && (
                <span className="hidden shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint sm:block">
                  {p.status}
                </span>
              )}

              <span
                className={`w-20 shrink-0 text-right text-[12px] tabular-nums ${
                  (p.total_inventory ?? 0) <= 0 ? "text-bad" : "text-muted"
                }`}
              >
                {p.total_inventory ?? 0} in stock
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
