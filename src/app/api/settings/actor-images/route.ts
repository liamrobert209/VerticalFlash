import { NextRequest, NextResponse } from "next/server";
import { getActorImageSlots } from "@/lib/actor-images-store";
import { getProductLinesConfig } from "@/lib/config";

export const runtime = "nodejs";

// Always returns exactly ACTOR_IMAGE_SLOT_COUNT slots (empty ones
// included) — see actor-images-store.ts. Uploading/relabeling/clearing a
// slot is [productLineId]/[slotId]/route.ts.
export async function GET(request: NextRequest) {
  const productLineId = request.nextUrl.searchParams.get("productLineId");
  if (!productLineId || !getProductLinesConfig().productLines.some((p) => p.id === productLineId)) {
    return NextResponse.json({ error: "Unknown product line" }, { status: 400 });
  }
  const slots = await getActorImageSlots(productLineId);
  return NextResponse.json({ slots });
}
