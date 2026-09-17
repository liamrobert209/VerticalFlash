import { NextResponse } from "next/server";
import { listAllAdsGroupedByCompetitorForProductLine } from "@/lib/ads-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

const PER_COMPETITOR_LIMIT = 30;

// All active competitor ads (static AND video) for one product line,
// grouped by competitor — reuses the same per-competitor-row shape as
// /api/weekly-static-ads, just for a single product line and without the
// static-only filter.
export async function GET(request: Request, { params }: { params: Promise<{ productLineId: string }> }) {
  const { productLineId } = await params;
  const { productLines } = getProductLinesConfig();
  const productLine = productLines.find((p) => p.id === productLineId);
  if (!productLine) {
    return NextResponse.json({ error: `Unknown product line: ${productLineId}` }, { status: 404 });
  }
  const competitors = await listAllAdsGroupedByCompetitorForProductLine(productLineId, PER_COMPETITOR_LIMIT);
  return NextResponse.json({ productLine: { id: productLine.id, label: productLine.label }, competitors });
}
