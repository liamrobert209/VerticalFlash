import { NextResponse } from "next/server";
import { listEligibleStaticAdsGroupedByProductLine } from "@/lib/ads-store";
import { getProductLinesConfig } from "@/lib/config";
import type { AdIntent } from "@/lib/ad-analysis-schema";
import type { Ad } from "@/lib/ads-schema";

export const runtime = "nodejs";

const PER_SECTION_LIMIT = 10;

interface IntentCount {
  intent: AdIntent;
  count: number;
}

// Rough per-product-line signal from whatever's been analyzed so far —
// not a full breakdown, just "what's common" to orient someone skimming
// the digest. Computed in JS over the already-fetched rows, not a second
// query.
function summarizeIntents(ads: Ad[]): IntentCount[] {
  const counts = new Map<AdIntent, number>();
  for (const ad of ads) {
    if (!ad.analysis) continue;
    counts.set(ad.analysis.intent, (counts.get(ad.analysis.intent) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET() {
  const { productLines } = getProductLinesConfig();
  const eligibleByProductLine = await listEligibleStaticAdsGroupedByProductLine(PER_SECTION_LIMIT);

  const sections = productLines.map((p) => {
    const ads = eligibleByProductLine.get(p.id) ?? [];
    return {
      productLineId: p.id,
      label: p.label,
      ads,
      commonIntents: summarizeIntents(ads),
    };
  });

  return NextResponse.json({
    productLines: sections,
    // Populated in a later phase once generated static-ad projects exist.
    ourAds: { accepted: [], discarded: [], drafts: [] },
  });
}
