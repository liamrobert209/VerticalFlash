import { z } from "zod";

// Isomorphic types/schema — split from brand-assets-store.ts (which touches
// fs/the database) so client components can import just these without
// dragging server-only code into the browser bundle.

export const BRAND_ASSET_KINDS = [
  "guideline",
  "logo",
  "illustration",
  "typography",
  "color_palette_primary",
  "color_palette_secondary",
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
  // Every kind used to require an uploaded file — "website" and the two
  // color-palette kinds don't strictly require one, so all three (plus
  // "typography", whose file is an optional specimen image) become
  // nullable.
  filename: z.string().nullable(),
  mimeType: z.string().nullable(),
  description: z.string().nullable(),
  // "website" kind — our business site, a competitor's site, an uploaded
  // mockup image, or any combination; the description field distinguishes
  // which. At least one of url/file is required, not both.
  url: z.string().nullable(),
  // "color_palette_primary"/"color_palette_secondary" kinds only — hex
  // codes, read by the static ad overlay compositor to style on-brand text
  // instead of the hardcoded defaults.
  colors: z.array(z.string()).nullable(),
  // "product_image" kind only — which product line this photo is for.
  productLineId: z.string().nullable(),
  // "typography" kind only — what this typeface is used for (e.g.
  // "Headlines", "Body copy") so entries can be tagged/filtered by use case.
  useCase: z.string().nullable(),
  uploadedAt: z.union([z.string(), z.date()]),
});

export type BrandAsset = z.infer<typeof BrandAssetZ>;
