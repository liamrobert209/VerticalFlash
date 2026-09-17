-- TikTok-wide trending videos (data_xplorer/tiktok-trends actor, "Top
-- Videos" mode) — not tied to any saved competitor/creator account, so
-- this is a separate table from scraped_content rather than forcing a
-- null account_id onto nearly every row of that table.
create table if not exists tiktok_trending_videos (
  id uuid primary key default gen_random_uuid(),
  -- The (industry, country) pair chosen for the sync that produced this
  -- row — sections on the Weekly Trending Content page group by this pair,
  -- not by TikTok's own per-video "Content Tags" (which can differ from
  -- the filter actually applied).
  industry text not null,
  country text not null,
  external_video_id text not null,
  rank integer,
  tiktok_url text,
  video_file_url text,
  cover_image_url text,
  creator_name text,
  creator_handle text,
  creator_avatar_url text,
  creator_follower_count integer,
  caption text,
  view_count bigint,
  engagement_rate double precision,
  view_through_rate double precision,
  content_tags text[] not null default '{}',
  published_at timestamptz,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (industry, country, external_video_id)
);

create index if not exists idx_tiktok_trending_videos_industry_country
  on tiktok_trending_videos(industry, country);
create index if not exists idx_tiktok_trending_videos_published_at
  on tiktok_trending_videos(published_at);
