import { NextResponse } from "next/server";
import { listTrendingVideosGrouped } from "@/lib/tiktok-trends-store";

export const runtime = "nodejs";

const PER_SECTION_LIMIT = 10;

// One section per (industry, country) pair that's ever been synced — see
// tiktok-trends-store.ts's listTrendingVideosGrouped for the grouping.
export async function GET() {
  const sections = await listTrendingVideosGrouped(PER_SECTION_LIMIT);
  return NextResponse.json({ sections });
}
