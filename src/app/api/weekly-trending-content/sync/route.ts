import { NextRequest, NextResponse } from "next/server";
import { apifyConfigured } from "@/lib/apify-client";
import { syncTrendingVideos } from "@/lib/tiktok-trends-sync";
import { TIKTOK_TREND_VIDEO_COUNTRIES } from "@/lib/tiktok-trends-schema";

export const runtime = "nodejs";
export const maxDuration = 600;

const TIKTOK_TREND_PERIODS = ["7", "30"] as const;

export async function POST(request: NextRequest) {
  if (!apifyConfigured()) {
    return NextResponse.json({ error: "APIFY_API_TOKEN is not configured" }, { status: 500 });
  }

  let body: {
    industry?: string;
    country?: string;
    period?: string;
    organicOnly?: boolean;
    maxItems?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const country = body.country;
  if (!country || !TIKTOK_TREND_VIDEO_COUNTRIES.includes(country as (typeof TIKTOK_TREND_VIDEO_COUNTRIES)[number])) {
    return NextResponse.json(
      { error: `country must be one of: ${TIKTOK_TREND_VIDEO_COUNTRIES.join(", ")}` },
      { status: 400 }
    );
  }
  const period = body.period;
  if (!period || !TIKTOK_TREND_PERIODS.includes(period as (typeof TIKTOK_TREND_PERIODS)[number])) {
    return NextResponse.json({ error: `period must be one of: ${TIKTOK_TREND_PERIODS.join(", ")}` }, { status: 400 });
  }

  try {
    const result = await syncTrendingVideos({
      industry: body.industry ?? "",
      country: country as (typeof TIKTOK_TREND_VIDEO_COUNTRIES)[number],
      period: period as (typeof TIKTOK_TREND_PERIODS)[number],
      organicOnly: body.organicOnly ?? false,
      maxItems: body.maxItems ?? 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("weekly-trending-content sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
