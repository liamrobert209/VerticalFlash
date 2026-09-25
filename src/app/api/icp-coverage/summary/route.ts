import { NextResponse } from "next/server";
import { getProductLinesConfig } from "@/lib/config";
import { getIcpSummary } from "@/lib/icp-coverage";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getProductLinesConfig();
  const summaries = await getIcpSummary(cfg);
  return NextResponse.json({ summaries });
}
