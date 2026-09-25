import { resolveIcp, type ProductLinesConfig } from "./product-lines";
import { listStaticAdProjects } from "./static-ad-store";
import { ANGLE_SOURCE_LISTS, type AngleSourceList } from "./icp-angles";

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
