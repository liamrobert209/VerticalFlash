import { NextResponse } from "next/server";
import { listHashtagVideosGrouped } from "@/lib/tiktok-hashtag-store";

export const runtime = "nodejs";

const PER_SECTION_LIMIT = 20;

// One section per hashtag that's ever been searched — see
// tiktok-hashtag-store.ts's listHashtagVideosGrouped for the grouping.
export async function GET() {
  const sections = await listHashtagVideosGrouped(PER_SECTION_LIMIT);
  return NextResponse.json({ sections });
}
