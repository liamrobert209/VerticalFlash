import { NextResponse } from "next/server";
import { listEligibleStaticAdsGroupedByCompetitor } from "@/lib/ads-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

// Ceiling per competitor, not a page size — the whole set (bounded well
// above realistic current volume) is fetched up front and paged through
// client-side, so no separate page-size param is needed here. Raised from
// 30: that cap was silently hiding real DB-stored ads older than whatever
// the 30 most recent happened to span — CompetitorAdRow's recent/older
// split (see its header comment) needs the true full set to page through
// via "Load More", not just a 30-row slice of it.
const PER_COMPETITOR_LIMIT = 500;

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
