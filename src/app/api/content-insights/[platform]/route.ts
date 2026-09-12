import { NextRequest, NextResponse } from "next/server";
import { listContentInsightsByAccount } from "@/lib/scraped-content-store";

export const runtime = "nodejs";

const MAX_ACCOUNTS = 20;

// Per-account breakdown of brand accounts' organic content for one
// channel — see /api/creator-insights/[platform] for the same shape
// against creator/affiliate accounts instead.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const accounts = await listContentInsightsByAccount(platform, "brand", MAX_ACCOUNTS);
  return NextResponse.json({ accounts });
}
