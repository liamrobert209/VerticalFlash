import { NextResponse } from "next/server";
import { listActiveAdsGroupedByProductLine } from "@/lib/ads-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

const PER_SECTION_LIMIT = 10;

// Two queries total (one per sort), not two per product line — see
// listActiveAdsGroupedByProductLine's own comment for why that distinction
// matters against a pooled connection limit.
export async function GET() {
  const { productLines } = getProductLinesConfig();

  const [newestByProductLine, longestRunningByProductLine] = await Promise.all([
    listActiveAdsGroupedByProductLine("newest", PER_SECTION_LIMIT),
    listActiveAdsGroupedByProductLine("longest_running", PER_SECTION_LIMIT),
  ]);

  const sections = productLines.map((p) => ({
    productLineId: p.id,
    label: p.label,
    newest: newestByProductLine.get(p.id) ?? [],
    longestRunning: longestRunningByProductLine.get(p.id) ?? [],
  }));

  return NextResponse.json({ productLines: sections });
}
