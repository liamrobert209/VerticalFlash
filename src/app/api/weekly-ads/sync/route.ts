import { NextRequest, NextResponse } from "next/server";
import { getCompetitor } from "@/lib/competitor-store";
import { apifyConfigured } from "@/lib/apify-client";
import { syncFacebookAds, syncTikTokAds, type SyncTarget } from "@/lib/weekly-ads-sync";

export const runtime = "nodejs";
// Apify actor runs are polled to completion — this can genuinely take
// several minutes for a multi-account batch.
export const maxDuration = 600;

const SYNCABLE_PLATFORMS = ["facebook", "tiktok"] as const;
type SyncablePlatform = (typeof SYNCABLE_PLATFORMS)[number];

// accountIds is required (no "sync everything" default) — each run costs
// real Apify credits per account searched, so which accounts to include is
// a deliberate choice made by the caller (the Weekly Ads UI, or whatever
// cron config is set up later), not an implicit blast across every saved
// competitor.
export async function POST(request: NextRequest) {
  if (!apifyConfigured()) {
    return NextResponse.json({ error: "APIFY_API_TOKEN is not configured" }, { status: 500 });
  }

  let platformId: string;
  let accountIds: string[];
  try {
    const body = await request.json();
    platformId = body.platformId;
    accountIds = Array.isArray(body.accountIds) ? body.accountIds : [];
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!SYNCABLE_PLATFORMS.includes(platformId as SyncablePlatform)) {
    return NextResponse.json(
      { error: `platformId must be one of: ${SYNCABLE_PLATFORMS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!accountIds.length) {
    return NextResponse.json({ error: "accountIds is required and must be non-empty" }, { status: 400 });
  }

  const targets: SyncTarget[] = [];
  const notFound: string[] = [];
  for (const id of accountIds) {
    const account = await getCompetitor(id);
    if (!account) {
      notFound.push(id);
      continue;
    }
    targets.push({
      accountId: account.id,
      name: account.name,
      productLineId: account.productLineIds[0] ?? null,
      facebookPageIds: account.facebookPageIds,
    });
  }
  if (!targets.length) {
    return NextResponse.json({ error: "None of the given accountIds were found", notFound }, { status: 404 });
  }

  try {
    const results =
      platformId === "facebook" ? await syncFacebookAds(targets) : [await syncTikTokAds(targets)];
    return NextResponse.json({ results, notFound });
  } catch (error) {
    console.error(`weekly-ads sync failed (${platformId}):`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
