import { NextRequest, NextResponse } from "next/server";
import { getProductLinesConfig } from "@/lib/config";
import { getPortfolioCoverage } from "@/lib/icp-coverage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const productLineId = request.nextUrl.searchParams.get("productLineId");
  if (!productLineId) {
    return NextResponse.json({ error: "productLineId is required" }, { status: 400 });
  }

  const cfg = getProductLinesConfig();
  if (!cfg.productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }

  const coverage = await getPortfolioCoverage(cfg, productLineId);
  return NextResponse.json(coverage);
}
