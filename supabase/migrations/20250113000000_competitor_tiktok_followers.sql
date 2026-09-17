-- Mirrors instagram_followers/facebook_followers — TikTok follower counts
-- are hand-entered today (no live refresh job exists), so without this
-- column the TikTok ads ranking always falls back to Instagram followers.
alter table competitor_accounts add column if not exists tiktok_followers integer;
