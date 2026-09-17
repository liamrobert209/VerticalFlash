import { runApifyActor } from "./apify-client";
import { recordHashtagVideoSighting } from "./tiktok-hashtag-store";

// Actor id and I/O shape confirmed via a real test call before writing this
// (three real items pulled for "bluelight") — same discipline as
// tiktok-trends-sync.ts. Input: { hashtags: string[], resultsPerPage:
// number } (paid video-download/subtitle add-ons exist but aren't needed
// here — no video file URL in the default output). Output items use
// camelCase keys, unlike tiktok-trends' actor.
const TIKTOK_HASHTAG_ACTOR_ID = "clockworks/tiktok-hashtag-scraper";

interface TikTokHashtagAuthorMeta {
  name?: string;
  nickName?: string;
  avatar?: string;
  fans?: number;
}

interface TikTokHashtagVideoMeta {
  coverUrl?: string;
}

interface TikTokHashtagHashtagRef {
  name?: string;
}

interface TikTokHashtagItem {
  id: string;
  text?: string;
  createTimeISO?: string;
  webVideoUrl?: string;
  isAd?: boolean;
  authorMeta?: TikTokHashtagAuthorMeta;
  videoMeta?: TikTokHashtagVideoMeta;
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  collectCount?: number;
  hashtags?: TikTokHashtagHashtagRef[];
  [key: string]: unknown;
}

export interface SyncHashtagVideosParams {
  hashtag: string;
  maxItems: number;
}

export interface SyncHashtagVideosResult {
  videosSeen: number;
  errors: string[];
}

export async function syncHashtagVideos(params: SyncHashtagVideosParams): Promise<SyncHashtagVideosResult> {
  const errors: string[] = [];
  const normalizedHashtag = params.hashtag.trim().replace(/^#/, "").toLowerCase();
  const items = await runApifyActor<TikTokHashtagItem>(TIKTOK_HASHTAG_ACTOR_ID, {
    hashtags: [normalizedHashtag],
    resultsPerPage: params.maxItems,
  });

  let videosSeen = 0;
  for (const item of items) {
    if (!item.id) continue;
    try {
      await recordHashtagVideoSighting({
        hashtag: normalizedHashtag,
        externalVideoId: item.id,
        tiktokUrl: item.webVideoUrl ?? null,
        coverImageUrl: item.videoMeta?.coverUrl ?? null,
        creatorName: item.authorMeta?.name ?? null,
        creatorHandle: item.authorMeta?.nickName ?? null,
        creatorAvatarUrl: item.authorMeta?.avatar ?? null,
        creatorFollowerCount: item.authorMeta?.fans ?? null,
        caption: item.text ?? null,
        viewCount: item.playCount ?? null,
        likeCount: item.diggCount ?? null,
        commentCount: item.commentCount ?? null,
        shareCount: item.shareCount ?? null,
        collectCount: item.collectCount ?? null,
        isAd: item.isAd ?? false,
        contentHashtags: item.hashtags?.map((h) => h.name).filter((n): n is string => !!n) ?? [],
        publishedAt: item.createTimeISO ?? null,
        raw: item as Record<string, unknown>,
      });
      videosSeen++;
    } catch (err) {
      errors.push(`Could not save hashtag video ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { videosSeen, errors };
}
