-- Competitor accounts previously stored only a handle per platform
-- (instagram_handle, facebook_handle, tiktok_handle) plus one generic
-- "website" field — no direct profile link per platform. Adds one.

alter table competitor_accounts add column if not exists instagram_url text;
alter table competitor_accounts add column if not exists facebook_url text;
alter table competitor_accounts add column if not exists tiktok_url text;
