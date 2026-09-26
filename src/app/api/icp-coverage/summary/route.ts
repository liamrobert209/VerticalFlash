import { NextResponse } from "next/server";
import { getProductLinesConfig } from "@/lib/config";
import { getIcpSummary, getSpendAllocation } from "@/lib/icp-coverage";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getProductLinesConfig();
  const [summaries, spendAllocation] = await Promise.all([getIcpSummary(cfg), getSpendAllocation(cfg)]);
  return NextResponse.json({ summaries, spendAllocation });
}
