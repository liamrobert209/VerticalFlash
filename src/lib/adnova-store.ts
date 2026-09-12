import { getAdnovaDb } from "./adnova-db";
import { TagPerformanceZ, type TagPerformance } from "./adnova-schema";

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
