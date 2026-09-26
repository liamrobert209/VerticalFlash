import { NextRequest, NextResponse } from "next/server";
import { getAdPerformanceReport, SORT_METRICS, type SortMetric } from "@/lib/ad-performance";
import { getProductLinesConfig } from "@/lib/config";

function parseSortBy(raw: string | null): SortMetric | undefined {
  return raw && (SORT_METRICS as string[]).includes(raw) ? (raw as SortMetric) : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const sortBy = parseSortBy(searchParams.get("sortBy"));

  const cfg = getProductLinesConfig();
  const report = await getAdPerformanceReport(cfg.productLines, { from, to, sortBy });
  return NextResponse.json(report);
}
