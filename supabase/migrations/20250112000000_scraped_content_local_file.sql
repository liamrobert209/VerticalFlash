-- Locally-cached filename for a scraped post's thumbnail image (see
-- competitor-content-media/ on the Railway volume) — mirrors
-- ads.creative_local_file from 20250107000000_ads_creative_local_file.sql.
-- The remote CDN URL (thumbnail_url) can go dead well before anything
-- uses it, so the thumbnail is downloaded once at sync time instead of
-- being re-fetched from the CDN later.
alter table scraped_content add column if not exists thumbnail_local_file text;
