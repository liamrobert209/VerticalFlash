import { z } from "zod";
import { BrandTagsZ, productCharacter as brandProductCharacter, type BrandConfig } from "./brand";

// Product-line + ICP configuration: everything the prompts and the UI need
// to know about Ocushield's 8 product lines and the 6 customer profiles
// behind them. Product-line *structure* (id/label/shortName/description/
// presenceRule/tags) is loaded server-side from product-lines.config.json
// (see config.ts); this module is isomorphic on purpose so client
// components can import the types. ICP *content* (the 5 ranked lists plus
// demographic/quote) lives in the icp_profiles DB table instead — see
// resolveIcp() below and ./icp-store — so that one function is DB-backed
// and server-only even though the rest of this module stays isomorphic.

export const RankedItemZ = z.object({
  label: z.string().min(1),
  surveyPct: z.number().optional(),
  reviewsPct: z.number().optional(),
});

export type RankedItem = z.infer<typeof RankedItemZ>;

export const IcpProfileZ = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase snake_case id"),
  label: z.string().min(1),
  problemsSolved: z.array(RankedItemZ).default([]),
  loves: z.array(RankedItemZ).default([]),
  hates: z.array(RankedItemZ).default([]),
  purchaseDrivers: z.array(RankedItemZ).default([]),
  nearMissObjections: z.array(RankedItemZ).default([]),
  demographic: z.string().min(1),
  representativeQuote: z.string().min(1),
});

export type IcpProfile = z.infer<typeof IcpProfileZ>;

// Fallback used by getIcpProfile() (./icp-store) when no icp_profiles row
// exists yet for a given id — so a fresh checkout with zero DB rows still
// boots cleanly instead of crashing, matching DEFAULT_PRODUCT_LINES_CONFIG's
// "app still boots" role for the config file itself.
export function emptyIcpProfile(id: string): IcpProfile {
  return {
    id,
    label: "Not yet defined",
    problemsSolved: [],
    loves: [],
    hates: [],
    purchaseDrivers: [],
    nearMissObjections: [],
    demographic: "Not yet defined.",
    representativeQuote: "",
  };
}

export const ProductLineZ = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase snake_case id"),
  label: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
  character: z.string().min(1).optional(),
  presenceRule: z.string().min(1),
  icpRef: z.string(),
  tags: BrandTagsZ.optional(),
});

export type ProductLine = z.infer<typeof ProductLineZ>;

export const ProductLinesConfigZ = z
  .object({
    defaultProductLineId: z.string(),
    productLines: z.array(ProductLineZ).min(1),
  })
  .refine(
    (cfg) => cfg.productLines.some((p) => p.id === cfg.defaultProductLineId),
    { message: "defaultProductLineId must match a productLines[].id" }
  );

export type ProductLinesConfig = z.infer<typeof ProductLinesConfigZ>;

// Used when no product-lines.config.json exists, so the app still boots
// (tests, CI, a fresh checkout) — mirrors DEFAULT_BRAND's role in brand.ts.
export const DEFAULT_PRODUCT_LINES_CONFIG: ProductLinesConfig = {
  defaultProductLineId: "default",
  productLines: [
    {
      id: "default",
      label: "Default product",
      shortName: "the product",
      description: "the brand's product",
      presenceRule: "true ONLY if the brand's product is visible in the frame at any point",
      icpRef: "default",
    },
  ],
};

export function productLineCharacter(product: ProductLine): string {
  return product.character ?? product.description;
}

// What prompt builders should actually interpolate: the active product
// line's fields, falling back to the brand-wide defaults when no product
// is pinned yet (e.g. the raw-analyze pass on a freshly downloaded video,
// before a project has a product line at all).
export interface EffectiveProduct {
  brandName: string;
  shortName: string;
  description: string;
  character: string;
  presenceRule: string;
}

export function resolveEffectiveProduct(
  brand: BrandConfig,
  productLinesConfig: ProductLinesConfig,
  productLineId: string | null
): EffectiveProduct {
  const product = productLineId ? findProductLine(productLinesConfig, productLineId) : null;
  return {
    brandName: brand.name,
    shortName: product?.shortName ?? brand.product.shortName,
    description: product?.description ?? brand.product.description,
    character: product ? productLineCharacter(product) : brandProductCharacter(brand),
    presenceRule: product?.presenceRule ?? brand.product.presenceRule,
  };
}

// DB-backed (see ./icp-store) — unlike the rest of this module, this one
// function is server-only. Returns null only when productLineId itself
// doesn't resolve to a known product line; a product line with no
// icp_profiles row yet still resolves, to getIcpProfile()'s empty-profile
// fallback.
export async function resolveIcp(cfg: ProductLinesConfig, productLineId: string): Promise<IcpProfile | null> {
  const product = cfg.productLines.find((p) => p.id === productLineId);
  if (!product) return null;
  const { getIcpProfile } = await import("./icp-store");
  return getIcpProfile(product.icpRef);
}

export function findProductLine(cfg: ProductLinesConfig, productLineId: string): ProductLine | null {
  return cfg.productLines.find((p) => p.id === productLineId) ?? null;
}

// The subset safe to ship to the browser. icpRef is just a join key (not
// ICP content itself) — included so client code (e.g. ProductLinesBoard)
// can tell which product lines share the same underlying icp_profiles row
// without a server round-trip per product line.
export interface PublicProductLine {
  id: string;
  label: string;
  shortName: string;
  icpRef: string;
}

export function toPublicProductLines(cfg: ProductLinesConfig): PublicProductLine[] {
  return cfg.productLines.map((p) => ({ id: p.id, label: p.label, shortName: p.shortName, icpRef: p.icpRef }));
}

// The angle-options vocabulary (ANGLE_SOURCE_LISTS/angleOptionsForIcp/...)
// moved to ./icp-angles — a genuinely client-safe module, unlike this one
// (resolveIcp's dynamic import("./icp-store") drags in the postgres client,
// which breaks the browser build the moment a client component imports a
// *value* — not just a type — from this file). Re-exported here so
// existing server-side imports from "@/lib/product-lines" keep working.
export { ANGLE_SOURCE_LISTS, ANGLE_SOURCE_LABELS, angleOptionsForIcp } from "./icp-angles";
export type { AngleSourceList, AngleOption } from "./icp-angles";
