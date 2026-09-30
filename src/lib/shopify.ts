/**
 * Thin wrapper over the Shopify Admin GraphQL API.
 * Server-side only — credentials and tokens must never reach the browser.
 *
 * Authentication uses the client credentials grant: the app's client ID and
 * secret are exchanged for an Admin API token that lives about 24 hours.
 * Legacy custom-app tokens (static shpat_ values from "Develop apps") stopped
 * working on 1 January 2026, so there is no long-lived token to store.
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

/** Renew this long before Shopify's stated expiry, so no request races it. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export function shopifyConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN &&
      process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET
  );
}

type CachedToken = { value: string; expiresAt: number };

// Per server instance. A cold start just asks for a new token, which costs
// one extra request, so this never needs to be shared or persisted.
let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    throw new Error(
      "Shopify is not configured. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET."
    );
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Shopify refused the app credentials (${res.status}). Check the client ID and secret, and that the app is installed on the store. ${body.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Shopify returned no access token");
  }

  cached = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
  };
  return cached.value;
}

/** A valid token, fetching a new one only when the cached one is near expiry. */
async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  // Several requests arriving together should share one exchange, not race.
  inflight ??= requestToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  retried = false
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = await getAccessToken();

  const res = await fetch(
    `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    }
  );

  // A token revoked early (app reinstalled, secret rotated) — refresh once.
  if (res.status === 401 && !retried) {
    cached = null;
    return shopifyGraphQL<T>(query, variables, true);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }
  if (!json.data) {
    throw new Error("Shopify returned no data");
  }
  return json.data;
}

export type ShopifyProduct = {
  shopify_product_id: string;
  title: string;
  handle: string | null;
  status: string | null;
  image_url: string | null;
  total_inventory: number | null;
  price: number | null;
  currency: string | null;
};

type ProductsQuery = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      title: string;
      handle: string;
      status: string;
      totalInventory: number | null;
      featuredMedia: { preview: { image: { url: string } | null } | null } | null;
      priceRangeV2: {
        minVariantPrice: { amount: string; currencyCode: string };
      } | null;
    }[];
  };
};

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        totalInventory
        featuredMedia { preview { image { url } } }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
      }
    }
  }
`;

/** Pull the full catalog, following pagination. */
export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const out: ShopifyProduct[] = [];
  let cursor: string | null = null;

  // Hard stop at 50 pages (5,000 products) so a bad cursor can't loop forever.
  for (let page = 0; page < 50; page++) {
    const data: ProductsQuery = await shopifyGraphQL<ProductsQuery>(
      PRODUCTS_QUERY,
      { cursor }
    );

    for (const node of data.products.nodes) {
      const amount = node.priceRangeV2?.minVariantPrice.amount;
      out.push({
        shopify_product_id: node.id,
        title: node.title,
        handle: node.handle ?? null,
        status: node.status ?? null,
        image_url: node.featuredMedia?.preview?.image?.url ?? null,
        total_inventory: node.totalInventory ?? null,
        price: amount != null ? Number(amount) : null,
        currency: node.priceRangeV2?.minVariantPrice.currencyCode ?? null,
      });
    }

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  return out;
}

export type LiveInventory = {
  totalInventory: number | null;
  status: string | null;
  variants: { title: string; sku: string | null; available: number | null }[];
};

type InventoryQuery = {
  product: {
    status: string;
    totalInventory: number | null;
    variants: {
      nodes: {
        title: string;
        sku: string | null;
        inventoryQuantity: number | null;
      }[];
    };
  } | null;
};

const INVENTORY_QUERY = `
  query Inventory($id: ID!) {
    product(id: $id) {
      status
      totalInventory
      variants(first: 100) {
        nodes { title sku inventoryQuantity }
      }
    }
  }
`;

/** Live stock for one product, fetched on demand when a creative is opened. */
export async function fetchLiveInventory(
  shopifyProductId: string
): Promise<LiveInventory | null> {
  const data = await shopifyGraphQL<InventoryQuery>(INVENTORY_QUERY, {
    id: shopifyProductId,
  });

  if (!data.product) return null;

  return {
    totalInventory: data.product.totalInventory,
    status: data.product.status,
    variants: data.product.variants.nodes.map((v) => ({
      title: v.title,
      sku: v.sku,
      available: v.inventoryQuantity,
    })),
  };
}
