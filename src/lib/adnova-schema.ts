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

// One row per ISO week (Monday-start), aggregated across every ad in
// adnova_ad_insights_daily. Two readings of the same spend/revenue ratio are
// carried side by side rather than picking one, since "MER" is used both
// ways in the wild: roas (revenue ÷ spend, higher is better) and merPct
// (spend ÷ revenue as a %, lower is better — matches a literal "MER under
// 30%" reading). revenueYoyPct is null wherever there's no matching week a
// year earlier in the data (see getAdInsightsDateRange's spanDays).
export const WeeklyPerformanceZ = z.object({
  weekStart: z.string(),
  spend: z.number(),
  revenue: z.number(),
  purchaseCount: z.number(),
  roas: z.number().nullable(),
  merPct: z.number().nullable(),
});

export type WeeklyPerformance = z.infer<typeof WeeklyPerformanceZ>;

// One ad, aggregated across a single week window. aiTags mirrors
// adnova_ad_insights_daily.ai_tags verbatim (usp, offer, theme, desire,
// emotion, persona, adAngle, assetType, ...) — shape isn't fixed by this
// app's pipeline, so it's read loosely rather than fully typed.
export const TopAdZ = z.object({
  adId: z.string(),
  adName: z.string().nullable(),
  productCategory: z.string().nullable(),
  spend: z.number(),
  revenue: z.number(),
  roas: z.number().nullable(),
  merPct: z.number().nullable(),
  aiTags: z.record(z.unknown()).nullable(),
});

export type TopAd = z.infer<typeof TopAdZ>;
