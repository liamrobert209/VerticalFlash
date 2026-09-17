import { NextRequest, NextResponse } from "next/server";
import { listAds } from "@/lib/ads-store";
import { AdQueryZ } from "@/lib/ads-schema";

export const runtime = "nodejs";

// Generic filtered ad listing — used by the Static Ad Generator's
// reference-ad picker (?productLineId=X&isStaticEligible=true), separate
// from the Weekly Ads/Weekly Static Ads digest endpoints, which return a
// fixed grouped-by-product-line shape rather than a flat filtered list.
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  try {
    const query = AdQueryZ.parse(params);
    const ads = await listAds(query);
    return NextResponse.json({ ads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid query" },
      { status: 400 }
    );
  }
}
