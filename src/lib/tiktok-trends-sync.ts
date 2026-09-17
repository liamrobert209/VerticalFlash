import { runApifyActor } from "./apify-client";
import { recordTrendingVideoSighting } from "./tiktok-trends-store";
import type { TikTokTrendVideoCountry } from "./tiktok-trends-schema";

// Actor id and I/O shape confirmed via a real (paid) test call before
// writing this, not guessed from the store page's docs alone — same
// discipline as weekly-ads-sync.ts's Facebook actor. Its input schema uses
// `trendType: "hashtags" | "videos"`; this module only ever requests
// "videos" (Top Videos mode) per the current feature scope. Output items
// use literal Title Case keys with spaces (an unusual but confirmed-real
// shape for this actor) rather than camelCase/snake_case.
const TIKTOK_TRENDS_ACTOR_ID = "data_xplorer/tiktok-trends";

interface TikTokTrendsMetric {
  metric: string;
  value: number;
}

interface TikTokTrendsVideoItem {
  "Video Rank"?: number;
  Cover?: string;
  Avatar?: string;
  Title?: string;
  Author?: string;
  "Author Handle"?: string;
  Views?: number;
  Metrics?: TikTokTrendsMetric[];
  "Content Tags"?: string[];
  Followers?: number;
  "Video ID": string;
  "Create Time"?: string;
  "Video TikTok URL"?: string;
  "Video File URL"?: string;
  [key: string]: unknown;
}

function metricValue(item: TikTokTrendsVideoItem, name: string): number | null {
  const found = item.Metrics?.find((m) => m.metric === name);
  return found ? found.value : null;
}

export interface SyncTrendingVideosParams {
  industry: string; // videoContentTag id ("" = all)
  country: TikTokTrendVideoCountry;
  period: "7" | "30";
  organicOnly: boolean;
  maxItems: number;
}

export interface SyncTrendingVideosResult {
  videosSeen: number;
  errors: string[];
}

export async function syncTrendingVideos(
  params: SyncTrendingVideosParams
): Promise<SyncTrendingVideosResult> {
  const errors: string[] = [];
  const items = await runApifyActor<TikTokTrendsVideoItem>(TIKTOK_TRENDS_ACTOR_ID, {
    trendType: "videos",
    videoCountry: params.country,
    videoPeriod: params.period,
    videoContentTag: params.industry,
    videoOrderBy: "1", // highest video views
    videoOrganicOnly: params.organicOnly,
    maxItems: params.maxItems,
  });

  let videosSeen = 0;
  for (const item of items) {
    if (!item["Video ID"]) continue;
    try {
      await recordTrendingVideoSighting({
        industry: params.industry,
        country: params.country,
        externalVideoId: item["Video ID"],
        rank: item["Video Rank"] ?? null,
        tiktokUrl: item["Video TikTok URL"] ?? null,
        videoFileUrl: item["Video File URL"] ?? null,
        coverImageUrl: item.Cover ?? null,
        creatorName: item.Author ?? null,
        creatorHandle: item["Author Handle"] ?? null,
        creatorAvatarUrl: item.Avatar ?? null,
        creatorFollowerCount: item.Followers ?? null,
        caption: item.Title ?? null,
        viewCount: item.Views ?? null,
        engagementRate: metricValue(item, "Engagement Rate"),
        viewThroughRate: metricValue(item, "6s View-Through Rate"),
        contentTags: item["Content Tags"] ?? [],
        publishedAt: item["Create Time"] ?? null,
        raw: item as Record<string, unknown>,
      });
      videosSeen++;
    } catch (err) {
      errors.push(
        `Could not save trending video ${item["Video ID"]}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { videosSeen, errors };
}
