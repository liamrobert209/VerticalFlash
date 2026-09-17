import { NextResponse } from "next/server";
import { getAd } from "@/lib/ads-store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(id);
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  return NextResponse.json(ad);
}
