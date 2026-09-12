import { NextRequest, NextResponse } from "next/server";
import { listContentInsightsByAccount } from "@/lib/scraped-content-store";

export const runtime = "nodejs";

const MAX_ACCOUNTS = 20;

// Per-account breakdown of creator/affiliate accounts' organic content for
// one channel — see /api/content-insights/[platform] for the same shape
// against brand accounts instead.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const accounts = await listContentInsightsByAccount(platform, "creator", MAX_ACCOUNTS);
  return NextResponse.json({ accounts });
}
