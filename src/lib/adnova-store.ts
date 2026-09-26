import { getAdnovaDb } from "./adnova-db";
import {
  TagPerformanceZ,
  CategorySpendZ,
  WeeklyPerformanceZ,
  TopAdZ,
  type TagPerformance,
  type CategorySpend,
  type WeeklyPerformance,
  type TopAd,
} from "./adnova-schema";

// Below this, a single day's spend on one ad is treated as noise (a handful
// of impressions with a lucky purchase can otherwise dominate a per-week
// ROAS ranking) rather than a real signal to build a "winning formula" from.
export const TOP_AD_MIN_SPEND = 20;

// postgres.js returns numeric/bigint columns as strings (to avoid silent
// precision loss on large bigints) — coerce before Zod validation, same
// reasoning as ads-store.ts's jsonb handling.
function parseTagPerformance(row: Record<string, unknown>): TagPerformance {
  return TagPerformanceZ.parse({
    ...row,
    spend: Number(row.spend),
    purchaseValue: Number(row.purchaseValue),
    purchaseCount: Number(row.purchaseCount),
    nAdDays: Number(row.nAdDays),
    nDistinctAds: Number(row.nDistinctAds),
    roas: row.roas == null ? null : Number(row.roas),
    rank: Number(row.rank),
  });
}

// Every distinct product_category the pipeline has actually tagged —
// shown as-is rather than mapped onto our own 8 product lines, since the
// categories don't line up 1:1 (e.g. "Ocuglow"/"Ocubulb" are real SKUs
// outside our product-lines config) and guessing a mapping would be
// misleading for a real spend/ROAS dataset.
export async function listAdnovaCategories(): Promise<string[]> {
  const sql = getAdnovaDb();
  const rows = await sql`
    select distinct product_category from adnova_ai_tag_performance_90d
    order by product_category
  `;
  return rows.map((r) => r.productCategory as string);
}

// Top N tag values per attribute (hook_tactic, usp, theme, ...), ranked by
// the pipeline's own precomputed `rank` (already ROAS-ordered) — grouped
// for a per-attribute breakdown rather than one flat list.
export async function listTagPerformance(
  productCategory: string | null,
  limitPerAttr: number
): Promise<Map<string, TagPerformance[]>> {
  const sql = getAdnovaDb();
  const rows = await sql`
    select * from adnova_ai_tag_performance_90d
    where rank <= ${limitPerAttr}
    ${productCategory ? sql`and product_category = ${productCategory}` : sql``}
    order by attr, rank
  `;
  const byAttr = new Map<string, TagPerformance[]>();
  for (const row of rows) {
    const parsed = parseTagPerformance(row);
    const list = byAttr.get(parsed.attr) ?? [];
    list.push(parsed);
    byAttr.set(parsed.attr, list);
  }
  return byAttr;
}

// Total spend/purchases/CPA per product_category, from a different table
// (adnova_ad_insights_daily, per-day-per-ad) than listAdnovaCategories'/
// listTagPerformance's adnova_ai_tag_performance_90d — real spend numbers
// confirmed via direct introspection (10 categories, $37.3k-$0.008k range).
// avgCostPerPurchase is computed from the totals rather than averaged from
// each row's own cost_per_purchase, so categories with many zero-purchase
// days don't skew the average.
export async function listSpendByCategory(): Promise<CategorySpend[]> {
  const sql = getAdnovaDb();
  const rows = await sql`
    select product_category,
      sum(spend) as total_spend,
      sum(purchase_count) as total_purchases,
      case when sum(purchase_count) > 0 then sum(spend) / sum(purchase_count) else null end as avg_cost_per_purchase
    from adnova_ad_insights_daily
    group by product_category
    order by total_spend desc
  `;
  return rows.map((r) =>
    CategorySpendZ.parse({
      ...r,
      totalSpend: Number(r.totalSpend),
      totalPurchases: Number(r.totalPurchases),
      avgCostPerPurchase: r.avgCostPerPurchase == null ? null : Number(r.avgCostPerPurchase),
    })
  );
}

export interface AdnovaDateRange {
  minDate: string;
  maxDate: string;
  spanDays: number;
}

// Whether a same-week-last-year comparison is even possible yet — confirmed
// via direct introspection that the dataset currently spans only ~4 months
// (all within one calendar year), so spanDays stays well under 365 for now.
export async function getAdInsightsDateRange(): Promise<AdnovaDateRange | null> {
  const sql = getAdnovaDb();
  const rows = await sql`
    select min(date)::text as min_date, max(date)::text as max_date
    from adnova_ad_insights_daily
  `;
  const row = rows[0];
  if (!row?.minDate || !row?.maxDate) return null;
  const spanDays =
    Math.round(
      (new Date(row.maxDate as string).getTime() - new Date(row.minDate as string).getTime()) / 86_400_000
    ) + 1;
  return { minDate: row.minDate as string, maxDate: row.maxDate as string, spanDays };
}

// One row per ISO week across the whole dataset, newest first.
export async function listWeeklyPerformance(): Promise<WeeklyPerformance[]> {
  const sql = getAdnovaDb();
  const rows = await sql`
    select
      date_trunc('week', date)::date::text as week_start,
      sum(spend) as spend,
      sum(purchase_value) as revenue,
      sum(purchase_count) as purchase_count
    from adnova_ad_insights_daily
    group by 1
    order by 1 desc
  `;
  return rows.map((r) => {
    const spend = Number(r.spend);
    const revenue = Number(r.revenue);
    return WeeklyPerformanceZ.parse({
      weekStart: r.weekStart,
      spend,
      revenue,
      purchaseCount: Number(r.purchaseCount),
      roas: spend > 0 ? revenue / spend : null,
      merPct: revenue > 0 ? (spend / revenue) * 100 : null,
    });
  });
}

// Top-performing individual ads active within one Monday-start week,
// ranked by ROAS. Spend/revenue are summed across the week; ai_tags is
// taken from the ad's most recent day in that window so one stale earlier
// tagging pass doesn't get equal weight to how the ad reads today.
export async function listTopAdsForWeek(weekStart: string, limit: number): Promise<TopAd[]> {
  const sql = getAdnovaDb();
  const rows = await sql`
    with per_ad as (
      select
        ad_id,
        max(ad_name) as ad_name,
        max(product_category) as product_category,
        sum(spend) as spend,
        sum(purchase_value) as revenue,
        (array_agg(ai_tags order by date desc))[1] as ai_tags
      from adnova_ad_insights_daily
      where date >= ${weekStart}::date and date < ${weekStart}::date + 7
      group by ad_id
    )
    select * from per_ad
    where spend >= ${TOP_AD_MIN_SPEND}
    order by (case when spend > 0 then revenue / spend else 0 end) desc
    limit ${limit}
  `;
  return rows.map((r) => {
    const spend = Number(r.spend);
    const revenue = Number(r.revenue);
    return TopAdZ.parse({
      adId: String(r.adId),
      adName: r.adName ?? null,
      productCategory: r.productCategory ?? null,
      spend,
      revenue,
      roas: spend > 0 ? revenue / spend : null,
      merPct: revenue > 0 ? (spend / revenue) * 100 : null,
      aiTags: r.aiTags ?? null,
    });
  });
}

export interface CampaignSpend {
  campaignName: string;
  spend: number;
  revenue: number;
  purchaseCount: number;
}

// Per-campaign totals, optionally scoped to a date range (inclusive). There's
// no dedicated funnel-stage column on this table — campaign_name is where
// that actually lives (TOF/MOF/BOF baked into the account's own naming
// convention; see ad-funnel.ts), so this stays a generic campaign rollup
// rather than a funnel-specific query.
export async function listCampaignSpend(from?: string, to?: string): Promise<CampaignSpend[]> {
  const sql = getAdnovaDb();
  const rows = await sql`
    select
      campaign_name,
      sum(spend) as spend,
      sum(purchase_value) as revenue,
      sum(purchase_count) as purchase_count
    from adnova_ad_insights_daily
    where true
    ${from ? sql`and date >= ${from}::date` : sql``}
    ${to ? sql`and date <= ${to}::date` : sql``}
    group by campaign_name
  `;
  return rows.map((r) => ({
    campaignName: r.campaignName as string,
    spend: Number(r.spend),
    revenue: Number(r.revenue),
    purchaseCount: Number(r.purchaseCount),
  }));
}
