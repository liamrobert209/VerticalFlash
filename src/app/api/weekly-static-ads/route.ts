import { NextResponse } from "next/server";
import { listEligibleStaticAdsGroupedByCompetitor } from "@/lib/ads-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

// Ceiling per competitor, not a page size — the whole set (bounded well
// above realistic current volume) is fetched up front and paged through
// client-side, so no separate page-size param is needed here.
const PER_COMPETITOR_LIMIT = 30;

export async function GET() {
  const { productLines } = getProductLinesConfig();
  const eligibleByProductLine = await listEligibleStaticAdsGroupedByCompetitor(PER_COMPETITOR_LIMIT);

  const sections = productLines.map((p) => ({
    productLineId: p.id,
    label: p.label,
    competitors: eligibleByProductLine.get(p.id) ?? [],
  }));

  return NextResponse.json({
    productLines: sections,
    // Populated in a later phase once generated static-ad projects exist.
    ourAds: { accepted: [], discarded: [], drafts: [] },
  });
}
