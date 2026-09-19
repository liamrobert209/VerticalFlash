-- Part of the "professional grade" reference-library work: tags an
-- "ad_example"-kind brand asset with which of the 8 ad-style types it
-- exemplifies, so the (future) comparison-QA gate can pull the right
-- reference pool for a finished ad instead of one shared bucket.
alter table brand_assets add column if not exists style_template text;

alter table brand_assets drop constraint if exists brand_assets_style_template_check;
alter table brand_assets add constraint brand_assets_style_template_check
  check (style_template is null or style_template in (
    'actor', 'announcement_sale', 'comparison', 'testimonial',
    'editorial_listicle', 'annotated_diagram', 'product_hero', 'product_macro'
  ));
