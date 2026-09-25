-- The "ad_example" pool mixes Ocushield's own ads with competitor ads
-- saved purely as style references (ZAGG, SafeSleeve, Block Blue Light,
-- Rugged) — nothing distinguished one from the other, so a query by
-- style_template alone could surface a competitor's ad as an "on-brand"
-- reference for generation. Defaults true since every OTHER kind (logo,
-- guideline, product_image, etc.) is inherently ours; only ad_example ever
-- has competitor content mixed in.
alter table brand_assets add column if not exists is_own_brand boolean not null default true;
