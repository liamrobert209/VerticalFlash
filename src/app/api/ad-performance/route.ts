import { NextResponse } from "next/server";
import { getAdPerformanceReport } from "@/lib/ad-performance";
import { getProductLinesConfig } from "@/lib/config";

export async function GET() {
  const cfg = getProductLinesConfig();
  const report = await getAdPerformanceReport(cfg.productLines);
  return NextResponse.json(report);
}
