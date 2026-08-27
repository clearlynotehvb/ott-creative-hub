export type AccountStatus = "pending" | "approved" | "rejected";

export type UserRole =
  | "owner"
  | "creative_lead"
  | "graphic_designer"
  | "media_buyer";
export type AssetRatio = "1:1" | "4:5" | "9:16";

export const RATIOS: AssetRatio[] = ["4:5", "1:1", "9:16"];

export const RATIO_LABEL: Record<AssetRatio, string> = {
  "4:5": "4:5 — Feed",
  "1:1": "1:1 — Square",
  "9:16": "9:16 — Story / Reels",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner",
  creative_lead: "Creative Lead",
  graphic_designer: "Graphic Designer",
  media_buyer: "Media Buyer",
};

/**
 * Roles with authority over the whole library: edit or delete anyone's
 * creatives, sync products, manage groups.
 */
export function canManageCreatives(role: UserRole | null | undefined): boolean {
  return role === "owner" || role === "creative_lead";
}

/**
 * Roles allowed to add creatives — currently everyone. Graphic Designers and
 * Media Buyers can upload and fix up their own work but nothing beyond that;
 * the database enforces the same split, so this is only about what the UI
 * bothers to show.
 */
export function canUploadCreatives(role: UserRole | null | undefined): boolean {
  return (
    canManageCreatives(role) ||
    role === "graphic_designer" ||
    role === "media_buyer"
  );
}

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
};

export type Product = {
  id: string;
  shopify_product_id: string;
  title: string;
  handle: string | null;
  status: string | null;
  image_url: string | null;
  total_inventory: number | null;
  price: number | null;
  currency: string | null;
  synced_at: string;
};

export type CreativeAsset = {
  id: string;
  creative_id: string;
  ratio: AssetRatio;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  kind: "image" | "video";
  poster_path: string | null;
  created_at: string;
};

export type CreativeCopy = {
  id: string;
  creative_id: string;
  headline: string;
  primary_text: string;
  position: number;
  created_at: string;
};

export type CreativeGroup = {
  id: string;
  name: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type Creative = {
  id: string;
  title: string;
  angle: string | null;
  product_id: string | null;
  group_id: string | null;
  notes: string | null;
  destination_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreativeWithRelations = Creative & {
  products: Product | null;
  creative_groups: CreativeGroup | null;
  creative_assets: CreativeAsset[];
  creative_copy: CreativeCopy[];
  profiles: Pick<Profile, "first_name" | "last_name"> | null;
};

export type AdAngle = {
  id: string;
  name: string;
  position: number;
  created_at: string;
};
