-- Locally-cached filename for a hashtag video's cover image (see
-- tiktok-media/ on the Railway volume) — TikTok's CDN signs cover_image_url
-- with an x-expires param that goes dead within days, so it gets
-- downloaded once at sync time instead of re-fetched from the CDN later.
-- Same reasoning/pattern as ads.creative_local_file (20250107000000).
alter table tiktok_hashtag_videos add column if not exists cover_image_local_file text;
