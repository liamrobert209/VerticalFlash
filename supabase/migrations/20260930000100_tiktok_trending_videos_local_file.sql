-- Locally-cached filenames for a trending video's cover image and full
-- video file (see tiktok-media/ on the Railway volume) — same expiring-CDN
-- reasoning as 20260930000000_tiktok_hashtag_videos_local_file.sql, for the
-- two remote URLs this table also carries.
alter table tiktok_trending_videos add column if not exists cover_image_local_file text;
alter table tiktok_trending_videos add column if not exists video_file_local_file text;
