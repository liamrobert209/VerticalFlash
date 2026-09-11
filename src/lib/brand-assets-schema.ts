import { z } from "zod";

// Isomorphic types/schema — split from brand-assets-store.ts (which touches
// fs/the database) so client components can import just these without
// dragging server-only code into the browser bundle.

export const BRAND_ASSET_KINDS = ["guideline", "logo", "icp_source", "competitor_source"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

export const BrandAssetZ = z.object({
  id: z.string(),
  kind: z.enum(BRAND_ASSET_KINDS),
  filename: z.string(),
  mimeType: z.string().nullable(),
  description: z.string().nullable(),
  uploadedAt: z.union([z.string(), z.date()]),
});

export type BrandAsset = z.infer<typeof BrandAssetZ>;
