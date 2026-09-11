import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ACTIVE_PRODUCT_COOKIE, getActiveProductLineIdFromRequest } from "@/lib/active-product";
import { getPublicProductLines } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    active: getActiveProductLineIdFromRequest(request),
    options: getPublicProductLines(),
  });
}

const BodyZ = z.object({ productLineId: z.string() });

export async function POST(request: NextRequest) {
  const body = BodyZ.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "productLineId is required" }, { status: 400 });
  }

  const options = getPublicProductLines();
  if (!options.some((p) => p.id === body.data.productLineId)) {
    return NextResponse.json({ error: `Unknown product line "${body.data.productLineId}"` }, { status: 400 });
  }

  const response = NextResponse.json({ active: body.data.productLineId, options });
  response.cookies.set(ACTIVE_PRODUCT_COOKIE, body.data.productLineId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
