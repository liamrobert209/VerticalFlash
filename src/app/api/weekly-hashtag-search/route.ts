import { NextResponse } from "next/server";
import { listHashtagVideosGrouped } from "@/lib/tiktok-hashtag-store";

export const runtime = "nodejs";

const PER_SECTION_LIMIT = 20;
// Top 25 most-recently-active tracked hashtags, not every hashtag ever
// searched — see tiktok-hashtag-store.ts's listHashtagVideosGrouped, which
// already orders groups by their most recent sighting.
const MAX_SECTIONS = 25;

export async function GET() {
  const sections = (await listHashtagVideosGrouped(PER_SECTION_LIMIT)).slice(0, MAX_SECTIONS);
  return NextResponse.json({ sections });
}
