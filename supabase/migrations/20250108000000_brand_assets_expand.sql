-- Brand Assets was a bare file-upload list (4 kinds, every asset required a
-- file). Expanding to cover website URLs, structured color palettes, and
-- product-line-tagged product photos — none of which have a file to upload.
alter table brand_assets alter column filename drop not null;
alter table brand_assets add column if not exists url text;
alter table brand_assets add column if not exists colors text[];
alter table brand_assets add column if not exists product_line_id text;

alter table brand_assets drop constraint if exists brand_assets_kind_check;
alter table brand_assets add constraint brand_assets_kind_check
  check (kind in ('guideline','logo','color_palette','website','social_example','ad_example','product_image','icp_source','competitor_source'));
