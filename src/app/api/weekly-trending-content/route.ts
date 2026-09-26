import { NextResponse } from "next/server";
import { listTrendingVideosGrouped } from "@/lib/tiktok-trends-store";
import { TIKTOK_TREND_INDUSTRIES } from "@/lib/tiktok-trends-schema";

export const runtime = "nodejs";

// Matches the daily-sync cron's own scope (US, top 5) — see
// weekly-sync-run.ts's syncTrending — so what's shown here always lines up
// with what the cron is actually keeping fresh.
const PER_SECTION_LIMIT = 5;
const COUNTRY = "US";

// Always one section per configured content tag, in that fixed order, even
// before the cron has ever synced it (as an empty section) — the page
// should show "here's every category" automatically, not just whichever
// combos happen to have a row on file.
export async function GET() {
  const grouped = await listTrendingVideosGrouped(PER_SECTION_LIMIT);
  const byIndustry = new Map(grouped.filter((g) => g.country === COUNTRY).map((g) => [g.industry, g.videos]));
  const sections = TIKTOK_TREND_INDUSTRIES.map((industry) => ({
    industry: industry.id,
    country: COUNTRY,
    videos: byIndustry.get(industry.id) ?? [],
  }));
  return NextResponse.json({ sections });
}
