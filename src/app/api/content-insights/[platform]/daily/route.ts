import { NextRequest, NextResponse } from "next/server";
import { socialMetricsConfigured } from "@/lib/social-metrics-db";
import { listFacebookDailyMetrics, listInstagramDailyMetrics } from "@/lib/social-metrics-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!socialMetricsConfigured()) {
    return NextResponse.json({ error: "SOCIAL_METRICS_DATABASE_URL is not configured" }, { status: 500 });
  }
  if (platform === "facebook") {
    return NextResponse.json({ metrics: await listFacebookDailyMetrics() });
  }
  if (platform === "instagram") {
    return NextResponse.json({ metrics: await listInstagramDailyMetrics() });
  }
  return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
}
