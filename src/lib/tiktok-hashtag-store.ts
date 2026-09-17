import type postgres from "postgres";
import { getDb } from "./db";
import {
  TikTokHashtagVideoZ,
  type TikTokHashtagVideo,
  type TikTokHashtagVideoSighting,
} from "./tiktok-hashtag-schema";

// postgres.js does not auto-decode jsonb columns into objects — see the
// identical note in tiktok-trends-store.ts's parseVideo().
function parseVideo(row: Record<string, unknown>): TikTokHashtagVideo {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  return TikTokHashtagVideoZ.parse({ ...row, raw });
}

// Upsert one observed video, keyed on (hashtag, external_video_id) — the
// same video can independently appear under more than one searched
// hashtag, so each hashtag gets its own row rather than one row with a
// sticky hashtag.
export async function recordHashtagVideoSighting(
  sighting: TikTokHashtagVideoSighting
): Promise<TikTokHashtagVideo> {
  const sql = getDb();
  const rows = await sql`
    insert into tiktok_hashtag_videos (
      hashtag, external_video_id, tiktok_url, cover_image_url, creator_name,
      creator_handle, creator_avatar_url, creator_follower_count, caption,
      view_count, like_count, comment_count, share_count, collect_count,
      is_ad, content_hashtags, published_at, raw
    ) values (
      ${sighting.hashtag}, ${sighting.externalVideoId}, ${sighting.tiktokUrl ?? null},
      ${sighting.coverImageUrl ?? null}, ${sighting.creatorName ?? null}, ${sighting.creatorHandle ?? null},
      ${sighting.creatorAvatarUrl ?? null}, ${sighting.creatorFollowerCount ?? null}, ${sighting.caption ?? null},
      ${sighting.viewCount ?? null}, ${sighting.likeCount ?? null}, ${sighting.commentCount ?? null},
      ${sighting.shareCount ?? null}, ${sighting.collectCount ?? null}, ${sighting.isAd ?? false},
      ${sighting.contentHashtags}, ${sighting.publishedAt ?? null},
      ${sighting.raw ? sql.json(sighting.raw as postgres.JSONValue) : null}
    )
    on conflict (hashtag, external_video_id) do update set
      tiktok_url = coalesce(excluded.tiktok_url, tiktok_hashtag_videos.tiktok_url),
      cover_image_url = coalesce(excluded.cover_image_url, tiktok_hashtag_videos.cover_image_url),
      creator_name = coalesce(excluded.creator_name, tiktok_hashtag_videos.creator_name),
      creator_handle = coalesce(excluded.creator_handle, tiktok_hashtag_videos.creator_handle),
      creator_avatar_url = coalesce(excluded.creator_avatar_url, tiktok_hashtag_videos.creator_avatar_url),
      creator_follower_count = coalesce(excluded.creator_follower_count, tiktok_hashtag_videos.creator_follower_count),
      caption = coalesce(excluded.caption, tiktok_hashtag_videos.caption),
      -- View/engagement metrics are a snapshot as of this sync, always
      -- overwritten (same convention as tiktok-trends-store.ts).
      view_count = coalesce(excluded.view_count, tiktok_hashtag_videos.view_count),
      like_count = coalesce(excluded.like_count, tiktok_hashtag_videos.like_count),
      comment_count = coalesce(excluded.comment_count, tiktok_hashtag_videos.comment_count),
      share_count = coalesce(excluded.share_count, tiktok_hashtag_videos.share_count),
      collect_count = coalesce(excluded.collect_count, tiktok_hashtag_videos.collect_count),
      is_ad = excluded.is_ad,
      content_hashtags = case when array_length(excluded.content_hashtags, 1) > 0 then excluded.content_hashtags else tiktok_hashtag_videos.content_hashtags end,
      raw = coalesce(excluded.raw, tiktok_hashtag_videos.raw),
      last_seen_at = now(),
      updated_at = now()
    returning *
  `;
  return parseVideo(rows[0]);
}

export interface HashtagVideoSection {
  hashtag: string;
  videos: TikTokHashtagVideo[];
}

// Every hashtag ever searched becomes its own section, most-recently-
// searched hashtag first (by its most recent sighting) — same "one section
// per synced group" convention as tiktok-trends-store.ts's
// listTrendingVideosGrouped, keyed on hashtag instead of industry/country.
export async function listHashtagVideosGrouped(limitPerGroup: number): Promise<HashtagVideoSection[]> {
  const sql = getDb();
  const rows = await sql`
    select * from (
      select *, row_number() over (
        partition by hashtag
        order by view_count desc nulls last
      ) as rn,
      max(last_seen_at) over (partition by hashtag) as group_last_seen_at
      from tiktok_hashtag_videos
    ) ranked
    where rn <= ${limitPerGroup}
    order by group_last_seen_at desc, rn asc
  `;
  const byGroup = new Map<string, HashtagVideoSection>();
  const order: string[] = [];
  for (const row of rows) {
    const video = parseVideo(row);
    const existing = byGroup.get(video.hashtag);
    if (existing) existing.videos.push(video);
    else {
      byGroup.set(video.hashtag, { hashtag: video.hashtag, videos: [video] });
      order.push(video.hashtag);
    }
  }
  return order.map((hashtag) => byGroup.get(hashtag)!);
}
