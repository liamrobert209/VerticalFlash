-- Competitor/saved-accounts data, content records, and brand-asset metadata.
-- Everything else in this app stays flat JSON on disk — this is deliberately
-- the only relational data, and the only thing meant to be reachable by
-- other services (scrapers, BI tools) beyond this Next.js app itself.

create extension if not exists "pgcrypto";

create table if not exists competitor_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null check (region in ('uk','eu','us')),
  website text,
  instagram_handle text,
  instagram_followers integer,
  facebook_handle text,
  facebook_followers integer,
  tiktok_handle text,
  tiktok_status text not null default 'not_found' check (tiktok_status in ('confirmed','present_unconfirmed','not_found')),
  positioning text,
  cross_category_flag boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists competitor_account_categories (
  account_id uuid not null references competitor_accounts(id) on delete cascade,
  category_id text not null,
  primary key (account_id, category_id)
);

create table if not exists competitor_account_product_lines (
  account_id uuid not null references competitor_accounts(id) on delete cascade,
  product_line_id text not null,
  primary key (account_id, product_line_id)
);

create index if not exists idx_competitor_categories_category on competitor_account_categories(category_id);
create index if not exists idx_competitor_product_lines_product on competitor_account_product_lines(product_line_id);
create index if not exists idx_competitor_accounts_region on competitor_accounts(region);
create index if not exists idx_competitor_accounts_tiktok_status on competitor_accounts(tiktok_status);

create table if not exists content_records (
  video_id text primary key,
  product_line_id text,
  platform_id text,
  content_type text not null check (content_type in ('remake','adhoc','prompt','music','master_cutdown')),
  source text not null check (source in ('tiktok_scan','tiktok_url','uploaded_footage','brief')),
  reference_origin text check (reference_origin in ('creator','ad')),
  format text,
  hook text,
  original_angle text,
  new_angle text,
  angle_source text,
  reference_video_id text,
  reference_account_handle text,
  reference_account_follower_count integer,
  reference_content_like_count integer,
  reference_content_comment_count integer,
  reference_account_positioning text,
  first_rendered_at timestamptz not null,
  last_rendered_at timestamptz not null,
  render_count integer not null default 1
);

create index if not exists idx_content_records_product_line on content_records(product_line_id);
create index if not exists idx_content_records_platform on content_records(platform_id);
create index if not exists idx_content_records_last_rendered on content_records(last_rendered_at);

create table if not exists brand_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('guideline','logo','icp_source','competitor_source')),
  filename text not null,
  mime_type text,
  description text,
  uploaded_at timestamptz not null default now()
);
