import { z } from "zod";

// Mirrors adnova_ai_tag_performance_90d exactly — a pre-aggregated,
// already-ranked view over Ocushield's own Meta ad performance, tagged by
// a creative-analytics pipeline that isn't part of this app. We only ever
// read this table.
export const TAG_ATTRIBUTES = [
  "ad_angle",
  "asset_type",
  "desire",
  "emotion",
  "headline_tactic",
  "hook_tactic",
  "offer",
  "theme",
  "usp",
  "visual_hook",
] as const;
export type TagAttribute = (typeof TAG_ATTRIBUTES)[number];

export const TagPerformanceZ = z.object({
  productCategory: z.string(),
  attr: z.string(),
  tagValue: z.string(),
  spend: z.number(),
  purchaseValue: z.number(),
  purchaseCount: z.number(),
  nAdDays: z.number(),
  nDistinctAds: z.number(),
  roas: z.number().nullable(),
  rank: z.number(),
});

export type TagPerformance = z.infer<typeof TagPerformanceZ>;

// One row per product_category, aggregated from adnova_ad_insights_daily
// (a different, per-day-per-ad table than adnova_ai_tag_performance_90d
// above) — confirmed real columns via direct introspection. Powers Ad
// Insights' budget/CPA/spend panel.
export const CategorySpendZ = z.object({
  productCategory: z.string(),
  totalSpend: z.number(),
  totalPurchases: z.number(),
  avgCostPerPurchase: z.number().nullable(),
});

export type CategorySpend = z.infer<typeof CategorySpendZ>;
