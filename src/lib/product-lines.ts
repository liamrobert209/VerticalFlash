import { z } from "zod";
import { BrandTagsZ, productCharacter as brandProductCharacter, type BrandConfig } from "./brand";

// Product-line + ICP configuration: everything the prompts and the UI need
// to know about Ocushield's 8 product lines and the 6 customer profiles
// behind them. Loaded server-side from product-lines.config.json (see
// config.ts); this module is isomorphic on purpose so client components can
// import the types.

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
    icps: z.array(IcpProfileZ).min(1),
  })
  .refine(
    (cfg) => cfg.productLines.every((p) => cfg.icps.some((i) => i.id === p.icpRef)),
    { message: "every productLine.icpRef must resolve to an icps[].id" }
  )
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
  icps: [
    {
      id: "default",
      label: "General audience",
      problemsSolved: [],
      loves: [],
      hates: [],
      purchaseDrivers: [],
      nearMissObjections: [],
      demographic: "Not yet defined.",
      representativeQuote: "",
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

export function resolveIcp(cfg: ProductLinesConfig, productLineId: string): IcpProfile | null {
  const product = cfg.productLines.find((p) => p.id === productLineId);
  if (!product) return null;
  return cfg.icps.find((i) => i.id === product.icpRef) ?? null;
}

export function findProductLine(cfg: ProductLinesConfig, productLineId: string): ProductLine | null {
  return cfg.productLines.find((p) => p.id === productLineId) ?? null;
}

// The subset safe to ship to the browser
export interface PublicProductLine {
  id: string;
  label: string;
  shortName: string;
}

export function toPublicProductLines(cfg: ProductLinesConfig): PublicProductLine[] {
  return cfg.productLines.map((p) => ({ id: p.id, label: p.label, shortName: p.shortName }));
}

// A closed vocabulary of hook/angle options for a product's ICP, used by the
// iterate-on-content tool's angle pickers. Each option carries which list it
// came from so content records can store that provenance.
export const ANGLE_SOURCE_LISTS = [
  "problemsSolved",
  "loves",
  "purchaseDrivers",
  "nearMissObjections",
] as const;

export type AngleSourceList = (typeof ANGLE_SOURCE_LISTS)[number];

export interface AngleOption {
  label: string;
  source: AngleSourceList;
}

export function angleOptionsForIcp(icp: IcpProfile): AngleOption[] {
  const options: AngleOption[] = [];
  for (const source of ANGLE_SOURCE_LISTS) {
    for (const item of icp[source]) {
      options.push({ label: item.label, source });
    }
  }
  return options;
}
