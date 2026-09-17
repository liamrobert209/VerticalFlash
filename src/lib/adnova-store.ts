import { getAdnovaDb } from "./adnova-db";
import { TagPerformanceZ, CategorySpendZ, type TagPerformance, type CategorySpend } from "./adnova-schema";

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
