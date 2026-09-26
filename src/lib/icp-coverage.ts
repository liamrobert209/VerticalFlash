import { resolveIcp, type ProductLinesConfig } from "./product-lines";
import { listStaticAdProjects } from "./static-ad-store";
import { ANGLE_SOURCE_LISTS, type AngleSourceList } from "./icp-angles";
import { getDb } from "./db";
import { adnovaConfigured } from "./adnova-db";
import { listSpendByCategory } from "./adnova-store";
import { PRODUCT_LINE_TO_ADNOVA_CATEGORY } from "./product-line-category-map";

// How many of OUR OWN generated static ads exist for each real ICP angle
// item, per product line — a content-gap view, not a competitor one (see
// icp-coverage-competitors.ts, once built, for that side). Every static-ad
// project already stores angleCategory/angleLabel at creation time (see
// static-ad-schema.ts and the /api/static-ads POST route), so this is pure
// aggregation of data that already exists, not a new classification step.

export interface CoverageItem {
  label: string;
  count: number;
}

export interface CategoryCoverage {
  category: AngleSourceList;
  items: CoverageItem[];
  // Ads tagged with this category but whose angleLabel doesn't match any
  // of the product line's ranked ICP items — a freely-typed custom angle
  // (angleCategory can be paired with any string, not just a canonical
  // list entry; see icp-angles.ts's describeAngle comment).
  customCount: number;
}

export interface PortfolioCoverage {
  productLineId: string;
  icpLabel: string | null;
  totalAds: number;
  categories: CategoryCoverage[];
  // Ads with no angleCategory at all (angleCategory: null — a fully custom
  // angle not tied to any ICP list, per static-ad-schema.ts's comment).
  uncategorizedCount: number;
}

export async function getPortfolioCoverage(
  cfg: ProductLinesConfig,
  productLineId: string
): Promise<PortfolioCoverage> {
  const icp = await resolveIcp(cfg, productLineId);
  const allProjects = await listStaticAdProjects({});
  const projects = allProjects.filter((p) => p.productLineId === productLineId);

  const categories: CategoryCoverage[] = ANGLE_SOURCE_LISTS.map((category) => {
    const rankedItems = icp?.[category] ?? [];
    const knownLabels = new Set(rankedItems.map((item) => item.label));

    const items: CoverageItem[] = rankedItems.map((item) => ({
      label: item.label,
      count: projects.filter((p) => p.angleCategory === category && p.angleLabel === item.label).length,
    }));

    const customCount = projects.filter(
      (p) => p.angleCategory === category && !knownLabels.has(p.angleLabel)
    ).length;

    return { category, items, customCount };
  });

  const uncategorizedCount = projects.filter((p) => p.angleCategory === null).length;

  return {
    productLineId,
    icpLabel: icp?.label ?? null,
    totalAds: projects.length,
    categories,
    uncategorizedCount,
  };
}

// Same category/item shape as our own portfolio, but built from competitor
// ads' icpAngle classification (ad-analyze.ts's classifyIcpAngle) instead
// of angleCategory/angleLabel — competitor ads don't have that field, so
// this is what maps their message onto OUR OWN pain-point list. Only
// meaningful once classifyIcpAngle has actually run on an ad (see
// weekly-ads-sync.ts's analyzeIfNeeded and scripts/backfill-icp-angles.ts
// for existing ones) — unclassified ads are silently invisible here, same
// as unanalyzed ones already are elsewhere in this app.
export interface CompetitorCoverage {
  accountId: string;
  accountName: string;
  categories: CategoryCoverage[];
  totalClassifiedAds: number;
}

export async function getCompetitorCoverage(
  cfg: ProductLinesConfig,
  productLineId: string
): Promise<CompetitorCoverage[]> {
  const sql = getDb();
  const icp = await resolveIcp(cfg, productLineId);

  const competitors = await sql`
    select c.id, c.name
    from competitor_accounts c
    join competitor_account_product_lines pl on pl.account_id = c.id
    where pl.product_line_id = ${productLineId}
    order by c.name
  `;

  // analysis->'icpAngle' being a genuine (not SQL) JSON null — classifyIcpAngle's
  // explicit "evaluated, no match" result, stored so a re-run of the
  // backfill script doesn't touch it again — still passes a plain
  // "is not null" check (a JSON null is a real jsonb value), so this
  // filters on the extracted category instead to only count ads that
  // actually matched a real ICP pain point/solution.
  const counts = await sql`
    select
      account_id,
      analysis->'icpAngle'->>'category' as category,
      analysis->'icpAngle'->>'label' as label,
      count(*)::int as count
    from ads
    where product_line_id = ${productLineId}
      and account_id is not null
      and analysis->'icpAngle'->>'category' is not null
    group by account_id, category, label
  `;

  return competitors.map((c) => {
    const accountId = c.id as string;
    const accountCounts = counts.filter((row) => row.accountId === accountId);

    const categories: CategoryCoverage[] = ANGLE_SOURCE_LISTS.map((category) => {
      const rankedItems = icp?.[category] ?? [];
      const knownLabels = new Set(rankedItems.map((item) => item.label));

      const items: CoverageItem[] = rankedItems.map((item) => ({
        label: item.label,
        count: accountCounts
          .filter((r) => r.category === category && r.label === item.label)
          .reduce((sum, r) => sum + (r.count as number), 0),
      }));

      const customCount = accountCounts
        .filter((r) => r.category === category && !knownLabels.has(r.label as string))
        .reduce((sum, r) => sum + (r.count as number), 0);

      return { category, items, customCount };
    });

    return {
      accountId,
      accountName: c.name as string,
      categories,
      totalClassifiedAds: accountCounts.reduce((sum, r) => sum + (r.count as number), 0),
    };
  });
}

// Real, observable stand-ins for competitor ad spend, which we have no
// actual access to (Facebook Ad Library doesn't expose it, Adnova only
// tracks our own campaigns) — agreed with the user as the basis for the
// Summary tab's competitive-intensity signal: how many active ads a
// competitor is currently running for this product line, how long they've
// been running on average, and their largest social following (a rough
// reach proxy).
export interface CompetitorIntensity {
  accountId: string;
  accountName: string;
  activeAdCount: number;
  avgDaysRunning: number | null;
  maxFollowerCount: number | null;
}

export async function getCompetitorIntensity(productLineId: string): Promise<CompetitorIntensity[]> {
  const sql = getDb();
  const rows = await sql`
    select
      c.id as account_id,
      c.name as account_name,
      greatest(
        coalesce(c.instagram_followers, 0),
        coalesce(c.facebook_followers, 0),
        coalesce(c.tiktok_followers, 0)
      ) as max_follower_count,
      count(a.id) filter (where a.is_active)::int as active_ad_count,
      avg(
        extract(epoch from (now() - coalesce(a.launch_date, a.first_seen_at))) / 86400
      ) filter (where a.is_active) as avg_days_running
    from competitor_accounts c
    join competitor_account_product_lines pl on pl.account_id = c.id
    left join ads a on a.account_id = c.id and a.product_line_id = ${productLineId}
    where pl.product_line_id = ${productLineId}
    group by c.id, c.name, c.instagram_followers, c.facebook_followers, c.tiktok_followers
    order by active_ad_count desc
  `;

  return rows.map((r) => ({
    accountId: r.accountId as string,
    accountName: r.accountName as string,
    activeAdCount: r.activeAdCount as number,
    avgDaysRunning: r.avgDaysRunning === null ? null : Math.round(Number(r.avgDaysRunning)),
    maxFollowerCount: (r.maxFollowerCount as number) || null,
  }));
}

// A gap: competitors are covering this pain point/solution and we have
// zero ads for it. Ranked by how much competitor activity is going into
// something we haven't touched at all.
export interface CoverageGap {
  category: AngleSourceList;
  label: string;
  competitorCount: number;
}

// The mirror case: we've built several ads for this item and see no
// competitor activity there at all — not necessarily bad, but worth a
// deliberate look rather than an accident of what got built first.
export interface OverIndexedItem {
  category: AngleSourceList;
  label: string;
  ourCount: number;
}

export interface ProductLineSummary {
  productLineId: string;
  productLineLabel: string;
  ourTotalAds: number;
  competitorActiveAdTotal: number;
  gaps: CoverageGap[];
  overIndexed: OverIndexedItem[];
  topCompetitorsByIntensity: CompetitorIntensity[];
  // Fraction (0-1) of this product line's ranked ICP items we have at
  // least one of our own ads for — "problemsSolved" (the deck's literal
  // "Problems Solved" section) for pain points, "purchaseDrivers" (the
  // deck's "Matters Most" section — what actually drives the purchase
  // decision, i.e. the solution's core selling points) for solutions.
  // null when the product line has no ranked items in that list at all
  // (nothing to divide by), not the same as 0% covered.
  painPointCoveragePct: number | null;
  solutionCoveragePct: number | null;
}

function coveragePct(category: CategoryCoverage | undefined): number | null {
  if (!category || category.items.length === 0) return null;
  const covered = category.items.filter((item) => item.count > 0).length;
  return covered / category.items.length;
}

export interface SpendAllocationItem {
  productLineId: string;
  productLineLabel: string;
  spend: number;
  percentOfTotal: number;
}

// Real spend, not a proxy — Adnova tracks our own ad-platform spend by its
// own "product_category" taxonomy, which only maps onto 5 of our 11
// product lines (see product-line-category-map.ts's header comment for
// which and why). Product lines with no mapping, or a mapping with zero
// spend on file, are simply omitted rather than shown at 0% — there's
// nothing to allocate for them yet, which reads differently from "we
// spent nothing on purpose."
export async function getSpendAllocation(cfg: ProductLinesConfig): Promise<SpendAllocationItem[]> {
  if (!adnovaConfigured()) return [];
  const categorySpend = await listSpendByCategory();
  const spendByCategory = new Map(categorySpend.map((c) => [c.productCategory, c.totalSpend]));

  const items = cfg.productLines
    .map((line) => {
      const category = PRODUCT_LINE_TO_ADNOVA_CATEGORY[line.id];
      const spend = category ? (spendByCategory.get(category) ?? 0) : 0;
      return { productLineId: line.id, productLineLabel: line.label, spend };
    })
    .filter((item) => item.spend > 0);

  const total = items.reduce((sum, item) => sum + item.spend, 0);
  return items
    .map((item) => ({ ...item, percentOfTotal: total > 0 ? item.spend / total : 0 }))
    .sort((a, b) => b.spend - a.spend);
}

const OVER_INDEXED_THRESHOLD = 3;
const TOP_COMPETITORS_SHOWN = 3;

// Cross-product-line by design — unlike the portfolio/competitor tabs
// (necessarily scoped to one product line at a time, since each has its
// own ICP list), the Summary's whole point is answering "which PRODUCT
// should we spend time on", which needs every line compared side by side.
// Skips any product line with no ICP profile configured — no pain-point
// list to compare coverage against, nothing meaningful to report.
export async function getIcpSummary(cfg: ProductLinesConfig): Promise<ProductLineSummary[]> {
  const summaries: ProductLineSummary[] = [];

  for (const line of cfg.productLines) {
    const icp = await resolveIcp(cfg, line.id);
    if (!icp) continue;

    const [portfolio, competitors, intensity] = await Promise.all([
      getPortfolioCoverage(cfg, line.id),
      getCompetitorCoverage(cfg, line.id),
      getCompetitorIntensity(line.id),
    ]);

    const gaps: CoverageGap[] = [];
    const overIndexed: OverIndexedItem[] = [];

    for (const category of portfolio.categories) {
      const competitorCategory = competitors
        .flatMap((c) => c.categories)
        .filter((c) => c.category === category.category);

      for (const item of category.items) {
        const competitorCount = competitorCategory.reduce(
          (sum, c) => sum + (c.items.find((i) => i.label === item.label)?.count ?? 0),
          0
        );
        if (item.count === 0 && competitorCount > 0) {
          gaps.push({ category: category.category, label: item.label, competitorCount });
        } else if (item.count >= OVER_INDEXED_THRESHOLD && competitorCount === 0) {
          overIndexed.push({ category: category.category, label: item.label, ourCount: item.count });
        }
      }
    }

    gaps.sort((a, b) => b.competitorCount - a.competitorCount);
    overIndexed.sort((a, b) => b.ourCount - a.ourCount);

    summaries.push({
      productLineId: line.id,
      productLineLabel: line.label,
      ourTotalAds: portfolio.totalAds,
      competitorActiveAdTotal: intensity.reduce((sum, c) => sum + c.activeAdCount, 0),
      gaps,
      overIndexed,
      topCompetitorsByIntensity: intensity.slice(0, TOP_COMPETITORS_SHOWN),
      painPointCoveragePct: coveragePct(portfolio.categories.find((c) => c.category === "problemsSolved")),
      solutionCoveragePct: coveragePct(portfolio.categories.find((c) => c.category === "purchaseDrivers")),
    });
  }

  // Most gaps first — the product lines most worth spending time on.
  summaries.sort((a, b) => b.gaps.length - a.gaps.length);
  return summaries;
}
