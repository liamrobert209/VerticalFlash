import { NextRequest, NextResponse } from "next/server";
import { listTagPerformance, listAdnovaCategories } from "@/lib/adnova-store";
import { adnovaConfigured } from "@/lib/adnova-db";
import { listAds } from "@/lib/ads-store";

export const runtime = "nodejs";

const TAG_PERF_LIMIT_PER_ATTR = 5;
const COMPETITOR_AD_LIMIT = 10;

// adnova's creative-analytics pipeline only tags Ocushield's own Meta
// (Facebook/Instagram) ad campaigns — there's no equivalent data source
// for TikTok/Reddit/Twitter/YouTube, so those channels only ever get the
// competitor-ads section (from our own ads table, synced via Weekly Ads).
const ADNOVA_PLATFORMS = new Set(["facebook", "instagram"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const category = request.nextUrl.searchParams.get("category");

  const competitorAds = await listAds({
    platformId: platform,
    isActive: true,
    sort: "newest",
    limit: COMPETITOR_AD_LIMIT,
  });

  if (!ADNOVA_PLATFORMS.has(platform)) {
    return NextResponse.json({
      adnovaAvailable: false,
      tagPerformance: {},
      categories: [],
      competitorAds,
    });
  }

  if (!adnovaConfigured()) {
    return NextResponse.json({
      adnovaAvailable: false,
      adnovaError: "ADNOVA_DATABASE_URL is not configured",
      tagPerformance: {},
      categories: [],
      competitorAds,
    });
  }

  try {
    const [tagPerformance, categories] = await Promise.all([
      listTagPerformance(category, TAG_PERF_LIMIT_PER_ATTR),
      listAdnovaCategories(),
    ]);
    return NextResponse.json({
      adnovaAvailable: true,
      tagPerformance: Object.fromEntries(tagPerformance),
      categories,
      competitorAds,
    });
  } catch (error) {
    console.error(`ad-insights adnova query failed (${platform}):`, error);
    return NextResponse.json({
      adnovaAvailable: false,
      adnovaError: error instanceof Error ? error.message : "adnova query failed",
      tagPerformance: {},
      categories: [],
      competitorAds,
    });
  }
}
