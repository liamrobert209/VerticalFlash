import type postgres from "postgres";
import { getDb } from "./db";
import {
  TikTokTrendingVideoZ,
  type TikTokTrendingVideo,
  type TikTokTrendingVideoSighting,
} from "./tiktok-trends-schema";
import { isTiktokCdnUrlExpired } from "./tiktok-cdn-url";

// postgres.js does not auto-decode jsonb columns into objects — see the
// identical note in ads-store.ts's parseAd().
function parseVideo(row: Record<string, unknown>): TikTokTrendingVideo {
  const raw = typeof row.raw === "string" ? JSON.parse(row.raw) : row.raw;
  return TikTokTrendingVideoZ.parse({ ...row, raw });
}

// Upsert one observed trending video, keyed on (industry, country,
// external_video_id) — a video can independently trend under more than one
// industry/country combo we've synced, so each combo gets its own row
// rather than a single row with a sticky industry/country.
export async function recordTrendingVideoSighting(
  sighting: TikTokTrendingVideoSighting
): Promise<TikTokTrendingVideo> {
  const sql = getDb();
  const rows = await sql`
    insert into tiktok_trending_videos (
      industry, country, external_video_id, rank, tiktok_url, video_file_url,
      cover_image_url, creator_name, creator_handle, creator_avatar_url,
      creator_follower_count, caption, view_count, engagement_rate,
      view_through_rate, content_tags, published_at, raw
    ) values (
      ${sighting.industry}, ${sighting.country}, ${sighting.externalVideoId},
      ${sighting.rank ?? null}, ${sighting.tiktokUrl ?? null}, ${sighting.videoFileUrl ?? null},
      ${sighting.coverImageUrl ?? null}, ${sighting.creatorName ?? null}, ${sighting.creatorHandle ?? null},
      ${sighting.creatorAvatarUrl ?? null}, ${sighting.creatorFollowerCount ?? null},
      ${sighting.caption ?? null}, ${sighting.viewCount ?? null}, ${sighting.engagementRate ?? null},
      ${sighting.viewThroughRate ?? null}, ${sighting.contentTags},
      ${sighting.publishedAt ?? null}, ${sighting.raw ? sql.json(sighting.raw as postgres.JSONValue) : null}
    )
    on conflict (industry, country, external_video_id) do update set
      rank = excluded.rank,
      tiktok_url = coalesce(excluded.tiktok_url, tiktok_trending_videos.tiktok_url),
      video_file_url = coalesce(excluded.video_file_url, tiktok_trending_videos.video_file_url),
      cover_image_url = coalesce(excluded.cover_image_url, tiktok_trending_videos.cover_image_url),
      creator_name = coalesce(excluded.creator_name, tiktok_trending_videos.creator_name),
      creator_handle = coalesce(excluded.creator_handle, tiktok_trending_videos.creator_handle),
      creator_avatar_url = coalesce(excluded.creator_avatar_url, tiktok_trending_videos.creator_avatar_url),
      creator_follower_count = coalesce(excluded.creator_follower_count, tiktok_trending_videos.creator_follower_count),
      caption = coalesce(excluded.caption, tiktok_trending_videos.caption),
      -- View/engagement metrics are a snapshot as of this sync, always
      -- overwritten (like scraped_content's engagement counts), not frozen.
      view_count = coalesce(excluded.view_count, tiktok_trending_videos.view_count),
      engagement_rate = coalesce(excluded.engagement_rate, tiktok_trending_videos.engagement_rate),
      view_through_rate = coalesce(excluded.view_through_rate, tiktok_trending_videos.view_through_rate),
      content_tags = case when array_length(excluded.content_tags, 1) > 0 then excluded.content_tags else tiktok_trending_videos.content_tags end,
      raw = coalesce(excluded.raw, tiktok_trending_videos.raw),
      last_seen_at = now(),
      updated_at = now()
    returning *
  `;
  return parseVideo(rows[0]);
}

export interface TrendingVideoSection {
  industry: string;
  country: string;
  videos: TikTokTrendingVideo[];
}

// Grouped by the (industry, country) pair chosen at sync time — each combo
// the user has ever synced becomes its own section on the Weekly Trending
// Content page, ranked within the group.
export async function listTrendingVideosGrouped(
  limitPerGroup: number
): Promise<TrendingVideoSection[]> {
  const sql = getDb();
  const rows = await sql`
    select * from (
      select *, row_number() over (
        partition by industry, country
        order by coalesce(rank, 2147483647) asc, view_count desc nulls last
      ) as rn
      from tiktok_trending_videos
    ) ranked
    where rn <= ${limitPerGroup}
  `;
  const byGroup = new Map<string, TrendingVideoSection>();
  for (const row of rows) {
    const video = parseVideo(row);
    const key = `${video.industry}::${video.country}`;
    const existing = byGroup.get(key);
    if (existing) existing.videos.push(video);
    else byGroup.set(key, { industry: video.industry, country: video.country, videos: [video] });
  }
  return Array.from(byGroup.values());
}

// Purges rows whose cover image has permanently died on TikTok's CDN — see
// tiktok-hashtag-store.ts's deleteExpiredHashtagVideos for why (same
// mechanism, same cadence, separate table).
export async function deleteExpiredTrendingVideos(): Promise<number> {
  const sql = getDb();
  const rows = await sql`select id, cover_image_url from tiktok_trending_videos`;
  const expiredIds = rows
    .filter((row) => isTiktokCdnUrlExpired(row.coverImageUrl as string | null))
    .map((row) => row.id as string);
  if (!expiredIds.length) return 0;
  await sql`delete from tiktok_trending_videos where id = any(${expiredIds})`;
  return expiredIds.length;
}
