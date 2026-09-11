-- Phase 2: data foundation for the Weekly Digest + Insights system.
-- No user-facing UI depends on this yet — Weekly Ads/Content/Creators
-- (phases 3-4) populate these tables, and Ad/Content/Creator Insights
-- (phases 6-8) query them.

-- Brand vs creator/affiliate accounts share the same competitor_accounts
-- table (same shape: handles, followers, region) but source different
-- Weekly Digest tabs — brand accounts feed Weekly Ads + Weekly Content,
-- creator accounts feed Weekly Creators.
alter table competitor_accounts
  add column if not exists account_type text not null default 'brand'
    check (account_type in ('brand','creator'));

create index if not exists idx_competitor_accounts_account_type on competitor_accounts(account_type);

-- Paid ad creative pulled from ad-transparency APIs (Meta Ad Library,
-- TikTok Commercial Content Library, etc.) — one row per ad per platform.
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references competitor_accounts(id) on delete set null,
  platform_id text not null,
  product_line_id text,
  -- The source API's own id for this ad — the upsert key so re-syncing
  -- doesn't create duplicates; unique per platform since ids aren't
  -- globally unique across platforms.
  external_ad_id text not null,
  headline text,
  body_text text,
  creative_url text,
  landing_url text,
  -- What the ad-library API reports as the ad's actual start date, when it
  -- reports one at all (not every platform/ad does) — the basis for
  -- "newest ads". Distinct from first_seen_at, which is just when OUR sync
  -- first observed it.
  launch_date timestamptz,
  first_seen_at timestamptz not null default now(),
  -- Bumped on every sync the ad still appears in — the basis for
  -- "longest-running" (largest last_seen_at - launch_date/first_seen_at)
  -- and for detecting an ad that's stopped running (is_active flips false
  -- once a sync no longer sees it).
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  tags text[] not null default '{}',
  -- Full raw API response, so a tagging/analysis pass can be re-run later
  -- without re-fetching from the source.
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, external_ad_id)
);

create index if not exists idx_ads_product_line on ads(product_line_id);
create index if not exists idx_ads_platform on ads(platform_id);
create index if not exists idx_ads_account on ads(account_id);
create index if not exists idx_ads_launch_date on ads(launch_date);
create index if not exists idx_ads_is_active on ads(is_active);

-- Organic posts scraped from brand or creator accounts — Weekly Content
-- and Weekly Creators both read this table, filtered by the source
-- account's account_type.
create table if not exists scraped_content (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references competitor_accounts(id) on delete set null,
  platform_id text not null,
  product_line_id text,
  external_content_id text not null,
  posted_at timestamptz,
  caption text,
  media_url text,
  thumbnail_url text,
  view_count integer,
  like_count integer,
  comment_count integer,
  share_count integer,
  tags text[] not null default '{}',
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, external_content_id)
);

create index if not exists idx_scraped_content_product_line on scraped_content(product_line_id);
create index if not exists idx_scraped_content_platform on scraped_content(platform_id);
create index if not exists idx_scraped_content_account on scraped_content(account_id);
create index if not exists idx_scraped_content_posted_at on scraped_content(posted_at);
