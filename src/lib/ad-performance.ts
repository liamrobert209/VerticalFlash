import { adnovaConfigured } from "./adnova-db";
import {
  getAdInsightsDateRange,
  listWeeklyPerformance,
  listTopAdsForWeek,
  type AdnovaDateRange,
} from "./adnova-store";
import type { WeeklyPerformance, TopAd } from "./adnova-schema";
import { PRODUCT_LINE_TO_ADNOVA_CATEGORY } from "./product-line-category-map";
import type { ProductLine } from "./product-lines";

// How many of the highest-spend weeks to surface — enough to compare a
// handful of candidate "best weeks" without pulling the whole history's
// worth of per-ad detail on every load.
export const TOP_WEEKS_SHOWN = 8;
export const TOP_ADS_PER_WEEK = 10;

const CREATIVE_TAG_ATTRIBUTES = [
  "adAngle",
  "desire",
  "emotion",
  "theme",
  "usp",
  "headlineTactic",
  "assetType",
  "persona",
] as const;

export interface CreativeTagValue {
  value: string;
  spendShare: number;
  adCount: number;
}

export interface CreativeTagBreakdown {
  attribute: string;
  values: CreativeTagValue[];
}

export interface ProductLineCreativeMakeup {
  productLineId: string;
  productLineLabel: string;
  adnovaCategory: string | null;
  totalSpend: number;
  adCount: number;
  breakdown: CreativeTagBreakdown[];
}

export interface BestWeek extends WeeklyPerformance {
  // Same week one year earlier — null until enough history exists (see
  // AdPerformanceReport.yoyAvailable).
  revenueYoyPct: number | null;
  // The user's alternative "best week" definition: revenue beat the same
  // week last year AND MER (spend/revenue) was under 30%. Always false
  // while revenueYoyPct is null rather than silently true/omitted.
  qualifiesAltCriterion: boolean;
  topAds: TopAd[];
  creativeMakeup: ProductLineCreativeMakeup[];
}

export type SortMetric = "spend" | "roas" | "mer";
export const SORT_METRICS: SortMetric[] = ["spend", "roas", "mer"];

export interface AdPerformanceOptions {
  // Inclusive week-start bounds, "YYYY-MM-DD". Omit either for an open end.
  from?: string;
  to?: string;
  // Which metric ranks "best week" — defaults to roas (see this file's
  // getAdPerformanceReport). "mer" ranks ascending (lower merPct is better);
  // the others rank descending.
  sortBy?: SortMetric;
}

export interface AdPerformanceReport {
  available: boolean;
  reason?: string;
  dateRange: AdnovaDateRange | null;
  yoyAvailable: boolean;
  sortBy: SortMetric;
  weeks: BestWeek[];
}

function tagValuesFor(tags: Record<string, unknown> | null, attr: string): string[] {
  if (!tags) return [];
  const v = tags[attr];
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  }
  if (typeof v === "string" && v.trim() !== "") return [v];
  return [];
}

function reverseCategoryMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [productLineId, category] of Object.entries(PRODUCT_LINE_TO_ADNOVA_CATEGORY)) {
    m.set(category, productLineId);
  }
  return m;
}

// Aggregates a set of top ads' ai_tags, weighted by each ad's spend, and
// groups the result by OUR product lines (not Adnova's raw categories) via
// PRODUCT_LINE_TO_ADNOVA_CATEGORY — an ad whose category has no mapping is
// kept as its own "unmapped" bucket rather than dropped or miscategorized.
export function buildCreativeMakeup(productLines: ProductLine[], ads: TopAd[]): ProductLineCreativeMakeup[] {
  const categoryToProductLine = reverseCategoryMap();
  const grouped = new Map<string, TopAd[]>();
  for (const ad of ads) {
    const productLineId = ad.productCategory ? categoryToProductLine.get(ad.productCategory) : undefined;
    const key = productLineId ?? `unmapped:${ad.productCategory ?? "unknown"}`;
    const list = grouped.get(key) ?? [];
    list.push(ad);
    grouped.set(key, list);
  }

  const result: ProductLineCreativeMakeup[] = [];
  for (const [key, groupAds] of grouped) {
    const productLine = productLines.find((p) => p.id === key);
    const totalSpend = groupAds.reduce((sum, a) => sum + a.spend, 0);

    const breakdown: CreativeTagBreakdown[] = CREATIVE_TAG_ATTRIBUTES.map((attr) => {
      const spendByValue = new Map<string, number>();
      const countByValue = new Map<string, number>();
      for (const ad of groupAds) {
        for (const value of tagValuesFor(ad.aiTags, attr)) {
          spendByValue.set(value, (spendByValue.get(value) ?? 0) + ad.spend);
          countByValue.set(value, (countByValue.get(value) ?? 0) + 1);
        }
      }
      const values = Array.from(spendByValue.entries())
        .map(([value, spend]) => ({
          value,
          spendShare: totalSpend > 0 ? spend / totalSpend : 0,
          adCount: countByValue.get(value) ?? 0,
        }))
        .sort((a, b) => b.spendShare - a.spendShare)
        .slice(0, 3);
      return { attribute: attr, values };
    }).filter((b) => b.values.length > 0);

    result.push({
      productLineId: productLine?.id ?? key,
      productLineLabel:
        productLine?.label ?? (key.startsWith("unmapped:") ? `Unmapped (${key.slice(9)})` : key),
      adnovaCategory: groupAds[0]?.productCategory ?? null,
      totalSpend,
      adCount: groupAds.length,
      breakdown,
    });
  }
  return result.sort((a, b) => b.totalSpend - a.totalSpend);
}

function sameWeekLastYear(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

const SORT_COMPARATORS: Record<SortMetric, (a: WeeklyPerformance, b: WeeklyPerformance) => number> = {
  spend: (a, b) => b.spend - a.spend,
  // nulls (no revenue at all) sort last regardless of direction
  roas: (a, b) => (b.roas ?? -Infinity) - (a.roas ?? -Infinity),
  mer: (a, b) => (a.merPct ?? Infinity) - (b.merPct ?? Infinity),
};

export async function getAdPerformanceReport(
  productLines: ProductLine[],
  options: AdPerformanceOptions = {}
): Promise<AdPerformanceReport> {
  const sortBy = options.sortBy ?? "roas";

  if (!adnovaConfigured()) {
    return {
      available: false,
      reason: "Adnova isn't connected — set ADNOVA_DATABASE_URL",
      dateRange: null,
      yoyAvailable: false,
      sortBy,
      weeks: [],
    };
  }

  const dateRange = await getAdInsightsDateRange();
  if (!dateRange) {
    return {
      available: false,
      reason: "No ad performance data synced yet",
      dateRange: null,
      yoyAvailable: false,
      sortBy,
      weeks: [],
    };
  }

  // A single matching prior-year week isn't enough to trust — require a
  // full year of history before treating YoY as real.
  const yoyAvailable = dateRange.spanDays > 365;

  const allWeeks = await listWeeklyPerformance();
  const byWeekStart = new Map(allWeeks.map((w) => [w.weekStart, w]));
  const candidateWeeks = allWeeks
    .filter((w) => w.spend > 0)
    .filter((w) => (options.from ? w.weekStart >= options.from : true))
    .filter((w) => (options.to ? w.weekStart <= options.to : true))
    .sort(SORT_COMPARATORS[sortBy])
    .slice(0, TOP_WEEKS_SHOWN);

  const weeks: BestWeek[] = [];
  for (const week of candidateWeeks) {
    const priorYearWeek = byWeekStart.get(sameWeekLastYear(week.weekStart));
    const revenueYoyPct =
      yoyAvailable && priorYearWeek && priorYearWeek.revenue > 0
        ? ((week.revenue - priorYearWeek.revenue) / priorYearWeek.revenue) * 100
        : null;
    const qualifiesAltCriterion =
      revenueYoyPct != null && revenueYoyPct > 0 && week.merPct != null && week.merPct < 30;

    const topAds = await listTopAdsForWeek(week.weekStart, TOP_ADS_PER_WEEK);
    weeks.push({
      ...week,
      revenueYoyPct,
      qualifiesAltCriterion,
      topAds,
      creativeMakeup: buildCreativeMakeup(productLines, topAds),
    });
  }

  return { available: true, dateRange, yoyAvailable, sortBy, weeks };
}
