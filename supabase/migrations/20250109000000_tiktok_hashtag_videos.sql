-- TikTok videos pulled via the clockworks/tiktok-hashtag-scraper Apify
-- actor, searched by hashtag rather than tied to any saved account or to
-- the fixed industry/country combos tiktok_trending_videos uses. Grouped
-- by the searched hashtag itself on the Search by Hashtag page, so this is
-- its own table rather than folded into tiktok_trending_videos (whose
-- grouping key doesn't apply here).
create table if not exists tiktok_hashtag_videos (
  id uuid primary key default gen_random_uuid(),
  hashtag text not null,
  external_video_id text not null,
  tiktok_url text,
  cover_image_url text,
  creator_name text,
  creator_handle text,
  creator_avatar_url text,
  creator_follower_count integer,
  caption text,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  share_count bigint,
  collect_count bigint,
  is_ad boolean not null default false,
  content_hashtags text[] not null default '{}',
  published_at timestamptz,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hashtag, external_video_id)
);

create index if not exists idx_tiktok_hashtag_videos_hashtag
  on tiktok_hashtag_videos(hashtag);
create index if not exists idx_tiktok_hashtag_videos_published_at
  on tiktok_hashtag_videos(published_at);
