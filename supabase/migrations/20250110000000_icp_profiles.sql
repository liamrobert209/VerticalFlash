-- ICP (ideal customer profile) content, one row per profile, keyed by the
-- same id strings product-lines.config.json's productLine.icpRef values
-- already point at (e.g. "iphone_shield_buyer"). Product-line *structure*
-- (id/label/shortName/description/presenceRule/tags) stays in the config
-- file — only the ICP research content (which changes as research evolves)
-- moves here, matching how Competitors/Brand Assets/Product Images already
-- live in the DB instead of hand-edited JSON.
create table icp_profiles (
  id text primary key,
  label text not null,
  problems_solved jsonb not null default '[]',
  loves jsonb not null default '[]',
  hates jsonb not null default '[]',
  purchase_drivers jsonb not null default '[]',
  near_miss_objections jsonb not null default '[]',
  demographic text not null default '',
  representative_quote text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
