import { NextRequest, NextResponse } from "next/server";
import { socialMetricsConfigured } from "@/lib/social-metrics-db";
import { listFacebookPosts, listInstagramPosts } from "@/lib/social-metrics-store";

export const runtime = "nodejs";

const POST_LIMIT = 500;

// Facebook/Instagram only — other channels keep the scraped_content-backed
// AccountInsightsChannelPage, unaffected by this route.
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!socialMetricsConfigured()) {
    return NextResponse.json({ error: "SOCIAL_METRICS_DATABASE_URL is not configured" }, { status: 500 });
  }
  if (platform === "facebook") {
    return NextResponse.json({ posts: await listFacebookPosts(POST_LIMIT) });
  }
  if (platform === "instagram") {
    return NextResponse.json({ posts: await listInstagramPosts(POST_LIMIT) });
  }
  return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
}
