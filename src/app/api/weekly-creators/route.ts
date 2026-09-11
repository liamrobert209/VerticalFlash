import { NextResponse } from "next/server";
import { listScrapedContentGroupedByProductLine } from "@/lib/scraped-content-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

const PER_SECTION_LIMIT = 10;

// Creator/affiliate accounts' organic posts — see /api/weekly-content for
// the same data filtered to brand accounts instead. Two queries total (one
// per sort), not two per product line.
export async function GET() {
  const { productLines } = getProductLinesConfig();

  const [newestByProductLine, topPerformingByProductLine] = await Promise.all([
    listScrapedContentGroupedByProductLine("creator", "newest", PER_SECTION_LIMIT),
    listScrapedContentGroupedByProductLine("creator", "top_performing", PER_SECTION_LIMIT),
  ]);

  const sections = productLines.map((p) => ({
    productLineId: p.id,
    label: p.label,
    newest: newestByProductLine.get(p.id) ?? [],
    topPerforming: topPerformingByProductLine.get(p.id) ?? [],
  }));

  return NextResponse.json({ productLines: sections });
}
