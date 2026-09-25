import { NextResponse } from "next/server";
import { getProductLinesConfig } from "@/lib/config";
import { getGenerationHistory } from "@/lib/generation-history";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getProductLinesConfig();
  const productLines = await getGenerationHistory(cfg);
  return NextResponse.json({ productLines });
}
