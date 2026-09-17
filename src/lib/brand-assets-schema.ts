import { z } from "zod";

// Isomorphic types/schema — split from brand-assets-store.ts (which touches
// fs/the database) so client components can import just these without
// dragging server-only code into the browser bundle.

export const BRAND_ASSET_KINDS = [
  "guideline",
  "logo",
  "color_palette",
  "website",
  "social_example",
  "ad_example",
  "product_image",
  "icp_source",
  "competitor_source",
] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

export const BrandAssetZ = z.object({
  id: z.string(),
  kind: z.enum(BRAND_ASSET_KINDS),
  // Every kind used to require an uploaded file — "website" and
  // "color_palette" don't, so both become nullable.
  filename: z.string().nullable(),
  mimeType: z.string().nullable(),
  description: z.string().nullable(),
  // "website" kind only — our business site, a competitor's site, or any
  // other reference URL; the description field distinguishes which.
  url: z.string().nullable(),
  // "color_palette" kind only — hex codes, read by the static ad overlay
  // compositor to style on-brand text instead of the hardcoded defaults.
  colors: z.array(z.string()).nullable(),
  // "product_image" kind only — which product line this photo is for.
  productLineId: z.string().nullable(),
  uploadedAt: z.union([z.string(), z.date()]),
});

export type BrandAsset = z.infer<typeof BrandAssetZ>;
