import { NextRequest, NextResponse } from "next/server";
import { apifyConfigured } from "@/lib/apify-client";
import { syncHashtagVideos } from "@/lib/tiktok-hashtag-sync";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  if (!apifyConfigured()) {
    return NextResponse.json({ error: "APIFY_API_TOKEN is not configured" }, { status: 500 });
  }

  let body: { hashtag?: string; maxItems?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const hashtag = body.hashtag?.trim();
  if (!hashtag) {
    return NextResponse.json({ error: "hashtag is required" }, { status: 400 });
  }

  try {
    const result = await syncHashtagVideos({ hashtag, maxItems: body.maxItems ?? 20 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("weekly-hashtag-search sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
