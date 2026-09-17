import { NextRequest, NextResponse } from "next/server";
import { getProductImageSlots } from "@/lib/product-images-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

// Always returns exactly 5 slots (empty ones included) — see
// product-images-store.ts. Uploading/relabeling/clearing a slot is
// [productLineId]/[slotId]/route.ts.
export async function GET(request: NextRequest) {
  const productLineId = request.nextUrl.searchParams.get("productLineId");
  if (!productLineId || !getProductLinesConfig().productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }
  const slots = await getProductImageSlots(productLineId);
  return NextResponse.json({ slots });
}
